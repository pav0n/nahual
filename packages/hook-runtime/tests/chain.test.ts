import { describe, expect, it } from "vitest";
import { createChainFold } from "../src/chain.ts";
import { requestContext, responseContext } from "./fixtures.ts";

const withHeader = (name: string, value: string) => {
  const ctx = requestContext();
  ctx.request.headers[name] = value;
  return ctx;
};

describe("createChainFold (R8, FR-010, FR-012)", () => {
  it("cada hook recibe lo acumulado; el resultado final es la diferencia con el original", () => {
    const fold = createChainFold(requestContext());
    fold.step("r1", { kind: "edit", parts: ["headers"], context: withHeader("x-a", "1") });
    const second = structuredClone(fold.current());
    second.request.headers["x-b"] = "2";
    second.request.method = "PUT";
    fold.step("r2", { kind: "edit", parts: ["method", "headers"], context: second });
    const { final, executions } = fold.result();
    expect(final).toEqual({
      kind: "edit",
      request: {
        method: "PUT",
        url: requestContext().request.url,
        headers: { ...requestContext().request.headers, "x-a": "1", "x-b": "2" },
      },
    });
    expect(executions.map((e) => e.result)).toEqual(["hooked", "hooked"]);
  });

  it("el hook del medio que falla no aporta y la cadena sigue (SC-009)", () => {
    const fold = createChainFold(requestContext());
    fold.step("r1", { kind: "edit", parts: ["headers"], context: withHeader("x-a", "1") });
    fold.step("r2", { kind: "error", type: "exception", message: "boom", line: 3 });
    const third = structuredClone(fold.current());
    third.request.headers["x-c"] = "3";
    fold.step("r3", { kind: "edit", parts: ["headers"], context: third });
    const { final, executions } = fold.result();
    expect(final.kind === "edit" && final.request?.headers).toMatchObject({
      "x-a": "1",
      "x-c": "3",
    });
    expect(executions.map((e) => e.result)).toEqual(["hooked", "hook_failed", "hooked"]);
    expect(executions[1]).toMatchObject({ errorType: "exception" });
  });

  it("respond termina la cadena: los siguientes ya no corren", () => {
    const fold = createChainFold(requestContext());
    fold.step("r1", { kind: "respond", status: 200, headers: {}, body: "{}" });
    expect(fold.done()).toBe(true);
    expect(fold.result().final).toEqual({ kind: "respond", status: 200, headers: {}, body: "{}" });
  });

  it("suspendidos y sin cambios", () => {
    const fold = createChainFold(responseContext());
    fold.skip("r1");
    fold.step("r2", { kind: "unchanged" });
    const { final, executions } = fold.result();
    expect(final).toEqual({ kind: "unchanged" });
    expect(executions.map((e) => e.result)).toEqual(["hook_skipped_suspended", "hook_unchanged"]);
  });

  it("etapa Response: solo la respuesta en el resultado y el body solo si cambió", () => {
    const fold = createChainFold(responseContext());
    const after = responseContext();
    if (after.response) after.response.status = 503;
    fold.step("r1", { kind: "edit", parts: ["status"], context: after });
    expect(fold.result().final).toEqual({
      kind: "edit",
      response: { status: 503, headers: responseContext().response?.headers },
    });
  });
});
