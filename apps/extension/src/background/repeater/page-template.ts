/**
 * Plantillas fijas del repeater en contexto de página (005, research R1, R2, R4). Se ejecutan con
 * `Runtime.callFunctionOn` en un mundo aislado del marco principal: el request llega **solo**
 * como argumento serializado y estos textos nunca se arman con datos (la prueba de integración
 * fija su hash). Corren en la pestaña, no en el SW: el `fetch` de dentro usa las cookies y el
 * origen de la página.
 *
 * El `//# sourceURL` constante deja reconocer el request en `Network.requestWillBeSent`
 * (`initiator.stack.callFrames[0].url`); va seguido de un salto de línea porque CDP envuelve la
 * declaración entre paréntesis (research X1).
 */

/** URL de script con la que la captura reconoce los requests del repeater. */
export const REPEATER_SOURCE_URL = "nahual-repeater";

export const PAGE_SEND = `async function (req) {
  const pending = (globalThis.__nahualRepeater ??= new Map());
  const controller = new AbortController();
  pending.set(req.sendId, controller);
  try {
    let body;
    if (req.body.kind === "text") body = req.body.text;
    else if (req.body.kind === "original")
      body = Uint8Array.from(atob(req.body.base64), (c) => c.charCodeAt(0));
    const init = {
      method: req.method,
      headers: req.headers,
      body,
      credentials: "include",
      cache: "no-store",
      redirect: "follow",
      signal: controller.signal,
    };
    const res = await /* nahual:page-template */ fetch(req.url, init);
    try {
      await res.arrayBuffer();
    } catch (error) {}
    return { ok: true, status: res.status };
  } catch (error) {
    return {
      ok: false,
      errorName: String(error && error.name).slice(0, 64),
      message: String(error && error.message).slice(0, 256),
    };
  } finally {
    pending.delete(req.sendId);
  }
}
//# sourceURL=nahual-repeater
`;

export const PAGE_ABORT = `function (sendId) {
  const controller = globalThis.__nahualRepeater && globalThis.__nahualRepeater.get(sendId);
  if (controller) controller.abort();
  return Boolean(controller);
}
`;

/** Lo que `PAGE_SEND` devuelve por `returnByValue`. */
export type PageSendResult =
  { ok: true; status: number } | { ok: false; errorName: string; message: string };

/** Argumento de `PAGE_SEND`: el request ya validado, con los headers activos. */
export interface PageSendArgument {
  sendId: string;
  method: string;
  url: string;
  headers: [string, string][];
  body: { kind: "none" } | { kind: "text"; text: string } | { kind: "original"; base64: string };
}
