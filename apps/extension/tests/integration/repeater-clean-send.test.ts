import { describe, expect, it, vi } from "vitest";
import { createCleanSender, type CleanSendDeps } from "../../src/background/repeater/clean-send.ts";

// 005 (research R5, FR-011, FR-011a, SC-005): envío desde el SW sin credenciales de la pestaña.

const argument = (overrides: Record<string, unknown> = {}) => ({
  sendId: "3f1c2b4a-8d9e-4f60-a1b2-c3d4e5f60718",
  method: "POST",
  url: "https://api.test/echo?x=1",
  headers: [["authorization", "Bearer written"]] as [string, string][],
  body: { kind: "text" as const, text: '{"a":1}' },
  ...overrides,
});

function deps(
  response: Response | Error = new Response('{"ok":true}', {
    status: 201,
    headers: { "content-type": "application/json", "x-a": "1" },
  }),
  granted = true,
) {
  const request = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(async () => {
    if (response instanceof Error) throw response;
    return response;
  });
  const hasPermission = vi.fn(async () => granted);
  return { request, hasPermission } satisfies CleanSendDeps;
}

describe("createCleanSender (contexto limpio)", () => {
  it("sin acceso al origen ⇒ permission_required con el origen y ninguna petición", async () => {
    const d = deps(undefined, false);
    const result = await createCleanSender(d).send(argument(), new AbortController().signal);
    expect(result).toEqual({
      ok: false,
      error: {
        code: "permission_required",
        messageKey: "repeater_error_permission_required",
        params: ["https://api.test"],
      },
    });
    expect(d.hasPermission).toHaveBeenCalledWith("https://api.test");
    expect(d.request).not.toHaveBeenCalled();
  });

  it("fetch sin credenciales, sin caché, siguiendo redirecciones y con la señal", async () => {
    const d = deps();
    const signal = new AbortController().signal;
    const result = await createCleanSender(d).send(argument(), signal);
    expect(d.request).toHaveBeenCalledWith("https://api.test/echo?x=1", {
      method: "POST",
      headers: [["authorization", "Bearer written"]],
      body: '{"a":1}',
      credentials: "omit",
      cache: "no-store",
      redirect: "follow",
      signal,
    });
    expect(result).toMatchObject({
      ok: true,
      response: {
        status: 201,
        headers: expect.arrayContaining([{ name: "x-a", value: "1" }]),
        body: { encoding: "text", text: '{"ok":true}' },
        mimeType: "application/json",
      },
      size: 11,
    });
  });

  it("body original binario se envía como bytes", async () => {
    const d = deps();
    await createCleanSender(d).send(
      argument({ body: { kind: "original", base64: "AAEC" } }),
      new AbortController().signal,
    );
    const init = d.request.mock.calls[0]?.[1] as unknown as { body: Uint8Array };
    expect([...init.body]).toEqual([0, 1, 2]);
  });

  it("respuesta de más de 5 MB ⇒ solo metadatos (tooLarge)", async () => {
    const big = new Response("x".repeat(5 * 1024 * 1024 + 10), {
      headers: { "content-type": "text/plain" },
    });
    const result = await createCleanSender(deps(big)).send(
      argument(),
      new AbortController().signal,
    );
    expect(result).toMatchObject({
      ok: true,
      response: { body: { encoding: "none", info: { available: false, reason: "tooLarge" } } },
    });
  });

  it("respuesta binaria ⇒ solo metadatos con su tamaño", async () => {
    const png = new Response(new Uint8Array([137, 80, 78, 71]), {
      headers: { "content-type": "image/png" },
    });
    const result = await createCleanSender(deps(png)).send(
      argument(),
      new AbortController().signal,
    );
    expect(result).toMatchObject({
      ok: true,
      response: {
        body: { encoding: "none", info: { available: false, size: 4, reason: "binary" } },
      },
      size: 4,
    });
  });

  it("error de red ⇒ network con el mensaje; aborto ⇒ cancelled", async () => {
    const network = await createCleanSender(deps(new TypeError("Failed to fetch"))).send(
      argument(),
      new AbortController().signal,
    );
    expect(network).toEqual({
      ok: false,
      error: { code: "network", messageKey: "repeater_error_network", params: ["Failed to fetch"] },
    });
    const abort = Object.assign(new Error("aborted"), { name: "AbortError" });
    const cancelled = await createCleanSender(deps(abort)).send(
      argument(),
      new AbortController().signal,
    );
    expect(cancelled).toMatchObject({ ok: false, error: { code: "cancelled" } });
  });
});
