import { MASK } from "@nahual/domain";
import type { HookContextData, HookOutcome } from "@nahual/hook-runtime";
import { describe, expect, it } from "vitest";
import { createHookHost, type HookRunPayload } from "../../src/panel/hooks/hook-host.ts";
import type { RunRequest } from "../../src/panel/hooks/sandbox-client.ts";

// 006 (T026, R1, R5–R7): el panel ejecuta la cadena en el sandbox (aquí simulado).

const context = (): HookContextData => ({
  stage: "request",
  resourceType: "Fetch",
  site: "http://app.test",
  request: {
    method: "GET",
    url: "http://api.test/items",
    headers: { authorization: "Bearer real", accept: "*/*" },
    body: { kind: "none", contentType: null, size: null },
    graphql: null,
  },
  response: null,
});

const NO = { changeDestination: false, readSensitive: false };
let n = 0;
const item = (source: string, permissions = NO) => ({
  ruleId: `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`,
  ruleName: `Hook ${n}`,
  source,
  permissions,
});

/** Sandbox simulado: cada `source` es el nombre de un comportamiento. */
function fakeSandbox(
  behaviours: Record<string, (r: RunRequest) => HookOutcome | Promise<HookOutcome>>,
) {
  const requests: RunRequest[] = [];
  return {
    requests,
    client: {
      run: async (request: RunRequest) => {
        requests.push(structuredClone(request));
        const behave = behaviours[request.source];
        if (!behave) throw new Error(`sin comportamiento ${request.source}`);
        return behave(request);
      },
    },
  };
}

const ok = (
  r: RunRequest,
  change?: (c: HookContextData) => void,
  extra: Partial<HookOutcome> = {},
): HookOutcome => {
  const ctx = structuredClone(r.context);
  change?.(ctx);
  return {
    kind: "ok",
    context: ctx,
    respond: null,
    stateChanged: false,
    state: r.state,
    logs: [],
    durationMs: 1,
    ...extra,
  } as HookOutcome;
};

function host(behaviours: Parameters<typeof fakeSandbox>[0]) {
  const sandbox = fakeSandbox(behaviours);
  const results: unknown[] = [];
  const executions: unknown[] = [];
  const h = createHookHost({
    sandbox: sandbox.client,
    send: (result) => results.push(result),
    record: (list) => executions.push(...list),
  });
  return { h, sandbox, results, executions };
}

const payload = (chain: ReturnType<typeof item>[], ctx = context()): HookRunPayload => ({
  runId: "11111111-1111-4111-8111-111111111111",
  exchangeId: "net-1",
  stage: ctx.stage,
  chain,
  context: ctx,
});

describe("HookHost", () => {
  it("cadena de tres: cada hook recibe lo acumulado y el SW recibe la diferencia", async () => {
    const { h, results, executions } = host({
      a: (r) => ok(r, (c) => (c.request.headers["x-a"] = "1")),
      b: (r) => {
        expect(r.context.request.headers["x-a"]).toBe("1");
        return ok(r, (c) => (c.request.headers["x-b"] = "2"));
      },
      c: (r) => ok(r),
    });
    await h.run(payload([item("a"), item("b"), item("c")]));
    expect(results[0]).toMatchObject({
      final: {
        kind: "edit",
        request: { headers: { authorization: "Bearer real", "x-a": "1", "x-b": "2" } },
      },
    });
    expect(
      (results[0] as { executions: { result: string }[] }).executions.map((e) => e.result),
    ).toEqual(["hooked", "hooked", "hook_unchanged"]);
    expect(executions).toHaveLength(3);
  });

  it("sin el permiso, el sandbox nunca ve un valor sensible y la máscara intacta conserva el original (SC-011)", async () => {
    const { h, sandbox, results } = host({
      a: (r) => ok(r, (c) => (c.request.headers["x-a"] = "1")),
    });
    await h.run(payload([item("a")]));
    expect(sandbox.requests[0]?.context.request.headers.authorization).toBe(MASK);
    expect(JSON.stringify(sandbox.requests)).not.toContain("Bearer real");
    expect(results[0]).toMatchObject({
      final: { request: { headers: { authorization: "Bearer real" } } },
    });
  });

  it("con el permiso de lectura el hook ve el valor real", async () => {
    const { h, sandbox } = host({ a: (r) => ok(r) });
    await h.run(payload([item("a", { ...NO, readSensitive: true })]));
    expect(sandbox.requests[0]?.context.request.headers.authorization).toBe("Bearer real");
  });

  it("respond corta la cadena", async () => {
    const { h, sandbox, results } = host({
      r: (req) => ok(req, undefined, { respond: { status: 200, headers: {}, body: "{}" } }),
      never: (req) => ok(req),
    });
    await h.run(payload([item("r"), item("never")]));
    expect(sandbox.requests).toHaveLength(1);
    expect(results[0]).toMatchObject({ final: { kind: "respond", status: 200 } });
  });

  it("cambiar el destino sin permiso es un error y el request sigue sin cambios", async () => {
    const { h, results } = host({ d: (r) => ok(r, (c) => (c.request.url = "http://evil.test/x")) });
    await h.run(payload([item("d")]));
    expect(results[0]).toMatchObject({
      final: { kind: "unchanged" },
      executions: [{ result: "hook_failed", errorType: "invalid_result" }],
    });
  });

  it("un error del sandbox no aporta y la cadena sigue", async () => {
    const { h, results } = host({
      boom: () => ({
        kind: "error",
        type: "exception",
        message: "boom",
        line: 2,
        logs: [],
        durationMs: 1,
      }),
      b: (r) => ok(r, (c) => (c.request.headers["x-b"] = "1")),
    });
    await h.run(payload([item("boom"), item("b")]));
    expect(results[0]).toMatchObject({ final: { request: { headers: { "x-b": "1" } } } });
  });

  it("20 ejecuciones simultáneas que incrementan un contador dejan state en 20 (SC-012)", async () => {
    const counter = (r: RunRequest) =>
      new Promise<HookOutcome>((resolve) =>
        setTimeout(() => {
          const state = { n: (((r.state as { n?: number }).n ?? 0) as number) + 1 };
          resolve(ok(r, undefined, { stateChanged: true, state }));
        }, 1),
      );
    const { h } = host({ c: counter });
    const hook = item("c");
    await Promise.all(Array.from({ length: 20 }, () => h.run(payload([hook]))));
    expect(h.state.snapshot().value).toEqual({ n: 20 });
  });

  it("un error no guarda state (FR-023)", async () => {
    const { h } = host({
      e: () => ({
        kind: "error",
        type: "exception",
        message: "x",
        line: null,
        logs: [],
        durationMs: 1,
      }),
    });
    await h.run(payload([item("e")]));
    expect(h.state.snapshot()).toEqual({ value: {}, version: 0 });
  });
});

describe("HookHost: suspensión (FR-022, SC-013)", () => {
  it("tras 5 errores seguidos el hook se salta sin ir al sandbox; reanudar lo vuelve a ejecutar", async () => {
    const { createSuspensions } = await import("@nahual/hook-runtime");
    const suspensions = createSuspensions();
    const sandbox = fakeSandbox({
      boom: () => ({
        kind: "error",
        type: "timeout",
        message: "x",
        line: null,
        logs: [],
        durationMs: 2000,
      }),
    });
    const results: { executions: { result: string }[] }[] = [];
    const h = createHookHost({
      sandbox: sandbox.client,
      send: (r) => results.push(r as never),
      record: () => undefined,
      isSuspended: (id) => suspensions.isSuspended(id),
      onOutcome: (id, failed) => void suspensions.record(id, failed),
    });
    const hook = item("boom");
    for (let i = 0; i < 6; i++) await h.run(payload([hook]));
    expect(sandbox.requests).toHaveLength(5);
    expect(results.at(-1)?.executions[0]?.result).toBe("hook_skipped_suspended");
    suspensions.resume(hook.ruleId);
    await h.run(payload([hook]));
    expect(sandbox.requests).toHaveLength(6);
  });
});
