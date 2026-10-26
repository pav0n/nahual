/**
 * Runtime fijo de un Worker de hooks (006, research R2/R3, contracts/sandbox-messaging.md). Se
 * serializa con `toString()` y se carga desde un `Blob`, así que **no puede usar nada de fuera
 * de su cuerpo**: ni imports ni funciones del módulo. El código del dev llega después, en `load`.
 *
 * Mensajes: `load { codeHash, js }` evalúa el hook una vez; `exec { execId, codeHash, context,
 * state }` lo ejecuta y responde `done { execId, outcome }` (`HookOutcome` de hook-runtime).
 */
export function workerMain(): void {
  const scope = self as unknown as Record<string, unknown> & {
    postMessage(message: unknown): void;
    addEventListener(type: "message", listener: (event: MessageEvent) => void): void;
  };
  const post = scope.postMessage.bind(scope);
  const listen = scope.addEventListener.bind(scope);
  const LOG_MAX = 1_000;
  const LOG_CHARS = 10_240;
  const MESSAGE_CHARS = 2_000;
  /** `new Function` añade 2 líneas antes del código del dev (research X1). */
  const LINE_OFFSET = 2;

  // Sin red, sin almacenamiento y sin canal propio (FR-031): además de la CSP, cada global
  // peligroso lanza `AccessDenied` al tocarlo, para que el error sea inmediato y claro.
  const denied = (name: string) => {
    const error = new Error(`${name} is not available in hooks`);
    error.name = "AccessDenied";
    return error;
  };
  for (const name of [
    "fetch",
    "XMLHttpRequest",
    "WebSocket",
    "WebTransport",
    "EventSource",
    "importScripts",
    "Worker",
    "SharedWorker",
    "BroadcastChannel",
    "indexedDB",
    "caches",
    "postMessage",
    "close",
    "onmessage",
    "addEventListener",
    "removeEventListener",
    "dispatchEvent",
  ]) {
    try {
      Object.defineProperty(scope, name, {
        get: () => {
          throw denied(name);
        },
        set: () => {
          throw denied(name);
        },
        configurable: false,
      });
    } catch {
      // Una propiedad no configurable del navegador: la CSP sigue bloqueándola.
    }
  }

  type Body = { kind: string; text?: string; contentType: string | null; size: number | null };
  type Part = { headers: Record<string, string>; body: Body };
  type Data = {
    stage: "request" | "response";
    resourceType: string;
    site: string;
    request: Part & { method: string; url: string; graphql: unknown };
    response: (Part & { status: number }) | null;
  };
  type Hook = (ctx: unknown) => unknown;

  const hooks = new Map<string, { hook?: Hook; error?: unknown }>();
  let currentLogs: string[] | null = null;

  const text = (value: unknown): string => {
    if (typeof value === "string") return value;
    if (value === undefined) return "undefined";
    try {
      return JSON.stringify(value) ?? String(value);
    } catch {
      return String(value);
    }
  };
  const pushLog = (logs: string[], values: unknown[]) => {
    if (logs.length >= LOG_MAX) return;
    logs.push(values.map(text).join(" ").slice(0, LOG_CHARS));
  };
  const consoleProxy = Object.fromEntries(
    ["log", "info", "warn", "error", "debug"].map((level) => [
      level,
      (...values: unknown[]) => {
        if (currentLogs) pushLog(currentLogs, values);
      },
    ]),
  );
  Object.defineProperty(scope, "console", { value: consoleProxy, configurable: false });

  class InvalidResult extends Error {}
  const bytes = (value: string) => new TextEncoder().encode(value).length;
  const info = (body: Body) => ({
    kind: body.kind,
    contentType: body.contentType,
    size: body.size,
  });
  const lowerKeys = (headers: unknown): Record<string, string> => {
    if (typeof headers !== "object" || headers === null)
      throw new InvalidResult("headers must be an object");
    return Object.fromEntries(
      Object.entries(headers).map(([name, value]) => [name.toLowerCase(), String(value)]),
    );
  };
  /** Lo que el hook dejó en `body` ⇒ `HookBody`; `null` deja el original. */
  const bodyBack = (original: Body, now: unknown): Body => {
    if (now === null || now === undefined) return original;
    if (typeof now !== "string") throw new InvalidResult("body must be a string");
    if (original.kind === "text" && original.text === now) return original;
    return { kind: "text", text: now, contentType: original.contentType, size: bytes(now) };
  };
  const lineOf = (error: unknown): number | null => {
    const match = /hook\.js:(\d+):/.exec(String((error as Error)?.stack ?? ""));
    if (!match) return null;
    const line = Number(match[1]) - LINE_OFFSET;
    return line >= 1 ? line : null;
  };
  const failure = (error: unknown, logs: string[], started: number) => {
    const name = (error as Error)?.name;
    return {
      kind: "error",
      type:
        error instanceof InvalidResult
          ? "invalid_result"
          : name === "AccessDenied" || name === "SecurityError"
            ? "access_denied"
            : "exception",
      message: String((error as Error)?.message ?? error).slice(0, MESSAGE_CHARS),
      line: error instanceof InvalidResult ? null : lineOf(error),
      logs,
      durationMs: performance.now() - started,
    };
  };

  async function run(data: Data, state: unknown, entry: { hook?: Hook; error?: unknown }) {
    const started = performance.now();
    const logs: string[] = [];
    if (entry.error !== undefined || !entry.hook) return failure(entry.error, logs, started);
    let responded: { status: number; headers: Record<string, string>; body: string } | null = null;
    type View = { headers: Record<string, string>; body: string | null };
    const part = (ctx: { request: View; response: View | null }) =>
      data.stage === "request" ? ctx.request : ctx.response;
    const stateIn = JSON.stringify(state ?? {});
    const ctx = {
      stage: data.stage,
      resourceType: data.resourceType,
      site: data.site,
      request: {
        method: data.request.method,
        url: data.request.url,
        headers: { ...data.request.headers },
        body: data.request.body.kind === "text" ? (data.request.body.text ?? "") : null,
        bodyInfo: info(data.request.body),
      },
      response: data.response
        ? {
            status: data.response.status,
            headers: { ...data.response.headers },
            body: data.response.body.kind === "text" ? (data.response.body.text ?? "") : null,
            bodyInfo: info(data.response.body),
          }
        : null,
      state: JSON.parse(stateIn) as unknown,
      graphql: data.request.graphql,
      log: (...values: unknown[]) => pushLog(logs, values),
      json(): unknown {
        const body = part(ctx)?.body;
        if (typeof body !== "string") throw new TypeError("The body is not text");
        return JSON.parse(body);
      },
      setHeader(name: string, value: string) {
        const target = part(ctx);
        if (target) target.headers[String(name).toLowerCase()] = String(value);
      },
      removeHeader(name: string) {
        const target = part(ctx);
        if (!target) return;
        const key = String(name).toLowerCase();
        target.headers = Object.fromEntries(
          Object.entries(target.headers).filter(([header]) => header !== key),
        );
      },
      respond(init: { status: number; headers?: Record<string, string>; body?: unknown }) {
        if (data.stage !== "request")
          throw new InvalidResult("respond() is only available in the Request stage");
        responded = {
          status: Number(init?.status),
          headers: lowerKeys(init?.headers ?? {}),
          body:
            typeof init?.body === "string"
              ? init.body
              : init?.body === undefined
                ? ""
                : JSON.stringify(init.body),
        };
      },
    };
    currentLogs = logs;
    try {
      const returned = await entry.hook(ctx);
      if (returned !== undefined && returned !== ctx)
        throw new InvalidResult("A hook must return ctx or nothing");
      const stateOut = JSON.stringify(ctx.state ?? {});
      const context: Data = {
        stage: ctx.stage,
        resourceType: ctx.resourceType,
        site: ctx.site,
        request: {
          method: String(ctx.request.method),
          url: String(ctx.request.url),
          headers: lowerKeys(ctx.request.headers),
          body: bodyBack(data.request.body, ctx.request.body),
          graphql: data.request.graphql,
        },
        response:
          data.response && ctx.response
            ? {
                status: Number(ctx.response.status),
                headers: lowerKeys(ctx.response.headers),
                body: bodyBack(data.response.body, ctx.response.body),
              }
            : null,
      };
      return {
        kind: "ok",
        context,
        respond: responded,
        stateChanged: stateOut !== stateIn,
        state: JSON.parse(stateOut) as unknown,
        logs,
        durationMs: performance.now() - started,
      };
    } catch (error) {
      return failure(error, logs, started);
    } finally {
      if (currentLogs === logs) currentLogs = null;
    }
  }

  listen("message", (event: MessageEvent) => {
    const message = event.data as Record<string, unknown> | null;
    if (typeof message !== "object" || message === null) return;
    if (
      message.type === "load" &&
      typeof message.codeHash === "string" &&
      typeof message.js === "string"
    ) {
      try {
        const exports: { default?: unknown } = {};
        const require = () => {
          throw new Error("Hooks cannot import modules");
        };
        new Function("exports", "require", `${message.js}\n//# sourceURL=hook.js`)(
          exports,
          require,
        );
        hooks.set(
          message.codeHash,
          typeof exports.default === "function"
            ? { hook: exports.default as Hook }
            : { error: new InvalidResult("The hook must export a default function") },
        );
      } catch (error) {
        hooks.set(message.codeHash, { error });
      }
      return;
    }
    if (
      message.type === "exec" &&
      typeof message.execId === "string" &&
      typeof message.codeHash === "string" &&
      typeof message.context === "object" &&
      message.context !== null
    ) {
      const execId = message.execId;
      const entry = hooks.get(message.codeHash) ?? { error: new Error("Hook not loaded") };
      void run(message.context as Data, message.state, entry).then((outcome) =>
        post({ type: "done", execId, outcome }),
      );
    }
  });
}

/** Texto del Worker para el `Blob`. */
export const WORKER_SOURCE = `(${workerMain.toString()})();`;
