import vm from "node:vm";
import { transform } from "sucrase";
import { describe, expect, it } from "vitest";
import { WORKER_SOURCE } from "../../src/sandbox/worker-runtime.ts";

// 006 (T024, contracts/sandbox-messaging.md): el runtime fijo del Worker, en un contexto de Node
// que imita el global de un Worker.

type Outcome = Record<string, unknown> & { kind: string; type?: string; logs: string[] };

function startWorker() {
  const posted: { type: string; execId: string; outcome: Outcome }[] = [];
  let listener: (event: { data: unknown }) => void = () => undefined;
  const scope: Record<string, unknown> = {
    postMessage: (message: never) => posted.push(message),
    addEventListener: (_type: string, fn: typeof listener) => (listener = fn),
    performance,
    TextEncoder,
    structuredClone,
    fetch: () => Promise.resolve("red"),
    setTimeout,
  };
  scope.self = scope;
  vm.runInNewContext(WORKER_SOURCE, scope);
  const load = (codeHash: string, source: string) =>
    listener({
      data: {
        type: "load",
        codeHash,
        js: transform(source, { transforms: ["typescript", "imports"] }).code,
      },
    });
  const exec = async (codeHash: string, context: unknown, state: unknown = {}) => {
    const execId = `e${posted.length}-${Math.random()}`;
    listener({ data: { type: "exec", execId, codeHash, context, state } });
    await new Promise((r) => setTimeout(r, 20));
    return posted.find((m) => m.execId === execId)?.outcome;
  };
  return { load, exec, posted, send: (data: unknown) => listener({ data }), scope };
}

const context = (stage: "request" | "response" = "response") => ({
  stage,
  resourceType: "Fetch",
  site: "http://app.test",
  request: {
    method: "GET",
    url: "http://api.test/items",
    headers: { authorization: "••••••" },
    body: { kind: "none", contentType: null, size: null },
    graphql: null,
  },
  response:
    stage === "response"
      ? {
          status: 200,
          headers: { "content-type": "application/json" },
          body: {
            kind: "text",
            text: '{"items":[1,2]}',
            contentType: "application/json",
            size: 15,
          },
        }
      : null,
});

describe("runtime del Worker de hooks", () => {
  it("ejecuta un hook TypeScript que cambia el body JSON y un header", async () => {
    const w = startWorker();
    w.load(
      "h1",
      `export default (ctx: HookContext) => {
  const data = ctx.json<{ items: number[] }>();
  data.items = [];
  ctx.response!.body = JSON.stringify(data);
  ctx.setHeader("X-Nahual", "1");
  ctx.log("items", data.items, { n: 1 });
  return ctx;
};`,
    );
    const outcome = await w.exec("h1", context());
    expect(outcome).toMatchObject({
      kind: "ok",
      context: {
        response: {
          headers: { "content-type": "application/json", "x-nahual": "1" },
          body: { kind: "text", text: '{"items":[]}', size: 12 },
        },
      },
      logs: ['items [] {"n":1}'],
      stateChanged: false,
    });
  });

  it("sin retorno no cambia nada; state cambiado se marca", async () => {
    const w = startWorker();
    w.load("h", `export default (ctx) => { ctx.state.n = (ctx.state.n ?? 0) + 1; };`);
    const outcome = await w.exec("h", context(), { n: 2 });
    expect(outcome).toMatchObject({ kind: "ok", stateChanged: true, state: { n: 3 } });
  });

  it("excepción con la línea del código del dev", async () => {
    const w = startWorker();
    w.load("h", `export default (ctx) => {\n  const x = 1;\n  throw new Error("boom " + x);\n};`);
    expect(await w.exec("h", context())).toMatchObject({
      kind: "error",
      type: "exception",
      message: "boom 1",
      line: 3,
    });
  });

  it("red y canales propios ⇒ access_denied", async () => {
    const w = startWorker();
    w.load("f", `export default async () => { await fetch("http://leak.test"); };`);
    expect(await w.exec("f", context())).toMatchObject({ kind: "error", type: "access_denied" });
    w.load("p", `export default () => { postMessage({ type: "done", execId: "otro" }); };`);
    expect(await w.exec("p", context())).toMatchObject({ kind: "error", type: "access_denied" });
  });

  it("respond en etapa Request; en Response es resultado inválido", async () => {
    const w = startWorker();
    w.load("r", `export default (ctx) => { ctx.respond({ status: 201, body: { id: 1 } }); };`);
    expect(await w.exec("r", context("request"))).toMatchObject({
      kind: "ok",
      respond: { status: 201, headers: {}, body: '{"id":1}' },
    });
    expect(await w.exec("r", context("response"))).toMatchObject({
      kind: "error",
      type: "invalid_result",
    });
  });

  it("devolver otra cosa que ctx o un body que no es texto ⇒ invalid_result", async () => {
    const w = startWorker();
    w.load("x", `export default () => 42;`);
    expect(await w.exec("x", context())).toMatchObject({ kind: "error", type: "invalid_result" });
    w.load("b", `export default (ctx) => { ctx.response.body = { a: 1 }; return ctx; };`);
    expect(await w.exec("b", context())).toMatchObject({ kind: "error", type: "invalid_result" });
  });

  it("require y la falta de export default fallan con su motivo", async () => {
    const w = startWorker();
    w.load("i", `import fs from "fs"; export default () => fs;`);
    expect(await w.exec("i", context())).toMatchObject({
      kind: "error",
      message: "Hooks cannot import modules",
    });
    w.load("d", `export const x = 1;`);
    expect(await w.exec("d", context())).toMatchObject({ kind: "error", type: "invalid_result" });
  });

  it("descarta mensajes mal formados sin responder", async () => {
    const w = startWorker();
    w.send({ type: "exec", execId: 1 });
    w.send({ type: "load", codeHash: 3 });
    w.send(null);
    w.send("hola");
    await new Promise((r) => setTimeout(r, 20));
    expect(w.posted).toEqual([]);
  });

  it("console.* va a los registros de la ejecución", async () => {
    const w = startWorker();
    w.load("c", `export default () => { console.warn("cuidado", 1); };`);
    expect((await w.exec("c", context()))?.logs).toEqual(["cuidado 1"]);
  });
});
