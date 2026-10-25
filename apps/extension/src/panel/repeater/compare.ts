import type { ComparableResponse, RepeaterRequest, RepeaterSend } from "@nahual/domain";
import type { RepeaterTab } from "./types.ts";

/** Un lado del diff de una pestaña (FR-022, FR-022a). */
export type SideRef = { kind: "original" } | { kind: "send"; sendId: string } | { kind: "pasted" };

const UNAVAILABLE = new Set(["binary", "tooLarge", "evicted", "none"]);

/** Respuesta de un envío como lado del diff; sin respuesta (fallo de red), body no disponible. */
export function comparableOfSend(send: RepeaterSend): ComparableResponse {
  const { response } = send;
  if (!response)
    return {
      origin: { kind: "send", sendId: send.sendId },
      status: null,
      headers: [],
      body: { kind: "unavailable", reason: "none", size: null },
    };
  const contentType =
    response.headers.find((h) => h.name.toLowerCase() === "content-type")?.value ??
    response.mimeType;
  const reason = response.body.encoding === "none" ? (response.body.info.reason ?? "none") : null;
  return {
    origin: { kind: "send", sendId: send.sendId },
    status: response.status,
    headers: response.headers,
    body:
      response.body.encoding === "text"
        ? { kind: "text", text: response.body.text, contentType }
        : {
            kind: "unavailable",
            reason: (UNAVAILABLE.has(reason ?? "") ? reason : "none") as "none",
            size: response.body.info.size,
          },
  };
}

/** Lado del diff por su referencia, o `null` si ya no existe (envío descartado, sin pegada). */
export function comparableOf(tab: RepeaterTab, ref: SideRef): ComparableResponse | null {
  if (ref.kind === "original") return tab.source?.response ?? null;
  if (ref.kind === "pasted")
    return tab.pasted
      ? {
          origin: { kind: "pasted" },
          status: null,
          headers: null,
          body: { kind: "text", text: tab.pasted.text, contentType: null },
        }
      : null;
  const send = tab.sends.find((s) => s.sendId === ref.sendId);
  return send && send.state !== "pending" ? comparableOfSend(send) : null;
}

/** Lados que se pueden comparar en la pestaña, en el orden en que se ofrecen. */
export function sidesOf(tab: RepeaterTab): SideRef[] {
  return [
    ...(tab.source ? [{ kind: "original" } as const] : []),
    ...tab.sends
      .filter((s) => s.state !== "pending")
      .map((s) => ({ kind: "send", sendId: s.sendId }) as const),
    ...(tab.pasted ? [{ kind: "pasted" } as const] : []),
  ];
}

export const sameSide = (a: SideRef, b: SideRef) =>
  a.kind === b.kind && (a.kind !== "send" || (b.kind === "send" && a.sendId === b.sendId));

/** Request cuyo endpoint guarda los ignorados: el del lado "después" si es un envío (FR-029). */
export function endpointRequest(
  tab: RepeaterTab,
  after: SideRef,
  before: SideRef,
): RepeaterRequest {
  for (const ref of [after, before]) {
    if (ref.kind === "send") {
      const send = tab.sends.find((s) => s.sendId === ref.sendId);
      if (send) return send.request;
    }
  }
  return tab.source?.request ?? tab.draft;
}

/** Número de un envío en la pestaña (1 = el primero que se hizo). */
export const sendNumber = (tab: RepeaterTab, sendId: string) => {
  const index = tab.sends.findIndex((s) => s.sendId === sendId);
  return index < 0 ? null : tab.sends.length - index + tab.droppedCount;
};
