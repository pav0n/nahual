import { textToBase64 } from "@nahual/domain";
import { beforeEach, describe, expect, it } from "vitest";
import {
  createActionExecutor,
  type ActionExecutor,
  type PausedTarget,
} from "../../src/background/action-executor.ts";
import { FakeDebugger } from "../fakes/fake-debugger.ts";

let cdp: FakeDebugger;
let executor: ActionExecutor;

const requestTarget: PausedTarget = {
  requestId: "fetch-1",
  stage: "request",
  status: null,
  requestHeaders: [
    { name: "accept", value: "application/json" },
    { name: "Cookie", value: "sid=secreto-real" },
  ],
  responseHeaders: [],
};

const responseTarget: PausedTarget = {
  requestId: "fetch-2",
  stage: "response",
  status: 500,
  requestHeaders: [],
  responseHeaders: [
    { name: "content-type", value: "application/json" },
    { name: "content-encoding", value: "gzip" },
    { name: "content-length", value: "20" },
  ],
};

beforeEach(async () => {
  cdp = new FakeDebugger();
  await cdp.attach(1);
  executor = createActionExecutor({ debugger: cdp });
});

describe("ActionExecutor (research R7)", () => {
  it("continuar sin cambios en cada etapa", async () => {
    expect(await executor.continueUnchanged(1, requestTarget)).toEqual({ ok: true });
    expect(await executor.continueUnchanged(1, responseTarget)).toEqual({ ok: true });
    expect(cdp.calls("Fetch.continueRequest")).toEqual([{ requestId: "fetch-1" }]);
    expect(cdp.calls("Fetch.continueResponse")).toEqual([{ requestId: "fetch-2" }]);
  });

  it("request editado ⇒ continueRequest con método, URL, headers y postData en base64", async () => {
    const headers = [...requestTarget.requestHeaders, { name: "x-nahual", value: "1" }];
    await executor.continueEdited(1, requestTarget, {
      method: "PATCH",
      url: "https://api.test/v2",
      headers,
      body: '{"ñ":1}',
    });
    expect(cdp.calls("Fetch.continueRequest")).toEqual([
      {
        requestId: "fetch-1",
        method: "PATCH",
        url: "https://api.test/v2",
        headers,
        postData: textToBase64('{"ñ":1}'),
      },
    ]);
  });

  it("los headers sensibles sin tocar viajan con su valor real (FR-004b)", async () => {
    await executor.continueEdited(1, requestTarget, { method: "POST" });
    expect(cdp.calls("Fetch.continueRequest")[0]).toMatchObject({
      headers: [
        { name: "accept", value: "application/json" },
        { name: "Cookie", value: "sid=secreto-real" },
      ],
    });
  });

  it("response solo con status o headers ⇒ continueResponse con responseCode (001-D6b)", async () => {
    await executor.continueEdited(1, responseTarget, { status: 200 });
    expect(cdp.calls("Fetch.continueResponse")).toEqual([
      { requestId: "fetch-2", responseCode: 200, responseHeaders: responseTarget.responseHeaders },
    ]);
  });

  it("response con body ⇒ fulfillRequest sin Content-Encoding y con Content-Length recalculado", async () => {
    await executor.continueEdited(1, responseTarget, { body: '{"ok":true}' });
    expect(cdp.calls("Fetch.fulfillRequest")).toEqual([
      {
        requestId: "fetch-2",
        responseCode: 500,
        responseHeaders: [
          { name: "content-type", value: "application/json" },
          { name: "content-length", value: "11" },
        ],
        body: textToBase64('{"ok":true}'),
      },
    ]);
  });

  it("mock desde la cola ⇒ fulfillRequest", async () => {
    await executor.mock(1, responseTarget, {
      kind: "mock",
      status: 200,
      headers: [{ name: "content-type", value: "application/json" }],
      body: "{}",
      bodyEncoding: "text",
    });
    expect(cdp.calls("Fetch.fulfillRequest")[0]).toMatchObject({
      requestId: "fetch-2",
      responseCode: 200,
      body: textToBase64("{}"),
    });
  });

  it("abortar ⇒ failRequest Aborted", async () => {
    await executor.fail(1, requestTarget, "aborted");
    expect(cdp.calls("Fetch.failRequest")).toEqual([
      { requestId: "fetch-1", errorReason: "Aborted" },
    ]);
  });

  it("comando fallido ⇒ un reintento sin cambios y apply_failed", async () => {
    cdp.failSend("Fetch.fulfillRequest", "cdp_error");
    expect(await executor.continueEdited(1, responseTarget, { body: "x" })).toEqual({
      ok: false,
      outcome: "apply_failed",
      errorKey: "error_cdp_error",
    });
    expect(cdp.calls("Fetch.continueResponse")).toEqual([{ requestId: "fetch-2" }]);
  });

  it("interceptación inválida (el request ya no existe) ⇒ gone sin reintentar", async () => {
    cdp.failSend("Fetch.continueRequest", "invalid_interception");
    expect(await executor.continueUnchanged(1, requestTarget)).toEqual({
      ok: false,
      outcome: "gone",
    });
    expect(cdp.calls("Fetch.continueRequest")).toHaveLength(1);
  });
});
