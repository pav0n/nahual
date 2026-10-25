import {
  repeaterRequestFromExchange,
  type CapturedExchange,
  type CapturedRequestBody,
  type ComparableResponse,
} from "@nahual/domain";
import { usePanelStore } from "../store/index.ts";
import { sw } from "../sw-client.ts";

const UNAVAILABLE = new Set(["binary", "tooLarge", "evicted", "none"]);

async function bodyEvent(exchangeId: string, side: "request" | "response", binary: boolean) {
  const reply = await sw.send("getBody", { exchangeId, side, ...(binary ? { binary: true } : {}) });
  const event = reply.ok ? reply.events.find((e) => e.type === "body") : undefined;
  return event?.type === "body" ? event.payload : null;
}

async function requestBody(exchange: CapturedExchange): Promise<CapturedRequestBody> {
  const info = exchange.requestBody;
  if (!info.available) return info.reason ? { kind: "unavailable", reason: info.reason } : null;
  const body = await bodyEvent(exchange.id, "request", true);
  if (!body) return { kind: "unavailable", reason: "evicted" };
  return body.encoding === "base64"
    ? { kind: "base64", base64: body.content, size: body.size }
    : { kind: "text", text: body.content };
}

/** La respuesta capturada, para "Comparar con el original" (FR-022). */
async function originalResponse(exchange: CapturedExchange): Promise<ComparableResponse> {
  const info = exchange.responseBody;
  const contentType =
    exchange.responseHeaders.find((h) => h.name.toLowerCase() === "content-type")?.value ?? null;
  let body: ComparableResponse["body"];
  if (info.available) {
    const loaded = await bodyEvent(exchange.id, "response", false);
    body = loaded
      ? { kind: "text", text: loaded.content, contentType }
      : { kind: "unavailable", reason: "evicted", size: info.size };
  } else {
    const reason = UNAVAILABLE.has(info.reason ?? "") ? info.reason : "none";
    body = { kind: "unavailable", reason: reason as "binary", size: info.size };
  }
  return {
    origin: { kind: "original" },
    status: exchange.status,
    headers: exchange.responseHeaders,
    body,
  };
}

/**
 * "Enviar al repeater" (005, FR-001, FR-002, FR-002a): abre una pestaña con el request capturado
 * y guarda su respuesta para compararla. Con 20 pestañas abiertas no abre nada y lo explica.
 */
export async function openRepeaterFromExchange(exchange: CapturedExchange): Promise<void> {
  const [body, response] = await Promise.all([requestBody(exchange), originalResponse(exchange)]);
  const { request, name, truncatedUrl } = repeaterRequestFromExchange(exchange, body);
  const store = usePanelStore.getState();
  const id = store.openRepeaterTab({
    name,
    request,
    source: { exchangeId: exchange.id, request, response },
  });
  if (!id) {
    store.pushToast({ messageKey: "repeater_tabs_full" });
    return;
  }
  if (truncatedUrl) store.pushToast({ messageKey: "repeater_url_truncated" });
  store.setSection("repeater");
}
