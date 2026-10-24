import {
  LIMITS,
  isTextualContentType,
  type BodyInfo,
  type RepeaterError,
  type RepeaterResponse,
} from "@nahual/domain";
import type { PageSendArgument } from "./page-template.ts";

/** Adaptadores del envío limpio: la red y el permiso de host (inyectables en las pruebas). */
export interface CleanSendDeps {
  request(url: string, init: RequestInit): Promise<Response>;
  /** ¿Hay acceso concedido a este origen (`optional_host_permissions`)? */
  hasPermission(origin: string): Promise<boolean>;
}

export type CleanSendResult =
  | { ok: true; response: RepeaterResponse; size: number | null }
  | { ok: false; error: RepeaterError };

/**
 * Único uso de red propia de la extensión (FR-036, research R14): solo envía lo que el dev pide
 * en contexto limpio y solo a un origen que concedió.
 */
export const chromeCleanSendDeps: CleanSendDeps = {
  request: (url, init) => /* nahual:repeater-clean-send */ fetch(url, init),
  hasPermission: (origin) => chrome.permissions.contains({ origins: [`${origin}/*`] }),
};

const error = (code: RepeaterError["code"], params?: string[]): CleanSendResult => ({
  ok: false,
  error: { code, messageKey: `repeater_error_${code}`, ...(params ? { params } : {}) },
});

function bytesOf(base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Lee el body con corte en 5 MB; `null` si se pasó. */
async function readCapped(response: Response): Promise<Uint8Array | null> {
  const reader = response.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > LIMITS.bodyBytes) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

/**
 * Envío en contexto limpio (005, research R5): `fetch` del SW sin cookies ni credenciales del
 * navegador (`credentials: "omit"`), sin caché, con corte del body en 5 MB. No pasa por la
 * pestaña, así que no toca reglas ni captura (FR-011).
 */
export function createCleanSender(deps: CleanSendDeps) {
  return {
    async send(argument: PageSendArgument, signal: AbortSignal): Promise<CleanSendResult> {
      const origin = new URL(argument.url).origin;
      if (!(await deps.hasPermission(origin))) return error("permission_required", [origin]);
      const body =
        argument.body.kind === "text"
          ? argument.body.text
          : argument.body.kind === "original"
            ? bytesOf(argument.body.base64)
            : undefined;
      let response: Response;
      try {
        response = await deps.request(argument.url, {
          method: argument.method,
          headers: argument.headers,
          ...(body !== undefined ? { body } : {}),
          credentials: "omit",
          cache: "no-store",
          redirect: "follow",
          signal,
        });
      } catch (e) {
        if (e instanceof Error && e.name === "AbortError") return error("cancelled");
        return error("network", [String(e instanceof Error ? e.message : e).slice(0, 256)]);
      }
      const contentType = response.headers.get("content-type");
      const headers = [...response.headers.entries()]
        .slice(0, 500)
        .map(([name, value]) => ({ name, value: value.slice(0, 65_536) }));
      const mimeType = contentType?.split(";")[0]?.trim() || null;
      let bytes: Uint8Array | null;
      try {
        bytes = await readCapped(response);
      } catch (e) {
        if (e instanceof Error && e.name === "AbortError") return error("cancelled");
        return error("network", [String(e instanceof Error ? e.message : e).slice(0, 256)]);
      }
      const info = (reason: BodyInfo["reason"], size: number | null): RepeaterResponse["body"] => ({
        encoding: "none",
        info: { available: false, size, ...(reason ? { reason } : {}) },
      });
      let responseBody: RepeaterResponse["body"];
      if (bytes === null) responseBody = info("tooLarge", null);
      else if (isTextualContentType(contentType) === false)
        responseBody = info("binary", bytes.length);
      else {
        try {
          responseBody = {
            encoding: "text",
            text: new TextDecoder("utf-8", { fatal: true }).decode(bytes),
          };
        } catch {
          responseBody = info("binary", bytes.length);
        }
      }
      return {
        ok: true,
        response: { status: response.status, headers, body: responseBody, mimeType },
        size: bytes?.length ?? null,
      };
    },
  };
}
