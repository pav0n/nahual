import { LIMITS } from "./schemas/limits.ts";

/** Límite de body evaluable de la constitución (principio VI). */
export const MAX_BODY_BYTES = LIMITS.bodyBytes;

export const utf8ByteLength = (text: string) => new TextEncoder().encode(text).length;

export function base64ByteLength(b64: string) {
  const padding = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return Math.floor((b64.length * 3) / 4) - padding;
}

/**
 * ¿El content-type es textual? `null` si no hay content-type: entonces decide si el contenido es
 * UTF-8 válido.
 */
export function isTextualContentType(contentType: string | null): boolean | null {
  if (!contentType) return null;
  const type = (contentType.split(";")[0] ?? "").trim().toLowerCase();
  if (type.startsWith("text/")) return true;
  if (type.endsWith("+json") || type.endsWith("+xml")) return true;
  return [
    "application/json",
    "application/xml",
    "application/javascript",
    "application/ecmascript",
    "application/x-www-form-urlencoded",
    "application/graphql",
    "application/ld+json",
  ].includes(type);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function textToBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

export type DecodedBody =
  | { kind: "text"; text: string; size: number }
  | { kind: "binary"; size: number }
  | { kind: "tooLarge"; size: number };

/**
 * Body tal como lo da CDP (`getResponseBody`, `postData`) ⇒ texto evaluable, binario o demasiado
 * grande. Los bodies binarios y los mayores que 5 MB solo se describen (FR-004, FR-012).
 */
export function decodeBody(input: {
  body: string;
  base64Encoded: boolean;
  contentType: string | null;
}): DecodedBody {
  const size = input.base64Encoded ? base64ByteLength(input.body) : utf8ByteLength(input.body);
  if (size > MAX_BODY_BYTES) return { kind: "tooLarge", size };
  const textual = isTextualContentType(input.contentType);
  if (textual === false) return { kind: "binary", size };
  if (!input.base64Encoded) return { kind: "text", text: input.body, size };
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(base64ToBytes(input.body));
    return { kind: "text", text, size };
  } catch {
    return { kind: "binary", size };
  }
}

/**
 * Al responder con un body nuevo: el body ya va descomprimido, así que se quita
 * `Content-Encoding` y se recalcula `Content-Length` (research R7).
 */
export function stripContentEncoding<T extends { name: string; value: string }>(
  headers: T[],
  byteLength: number,
): { name: string; value: string }[] {
  const kept = headers.filter((h) => {
    const name = h.name.toLowerCase();
    return name !== "content-encoding" && name !== "content-length";
  });
  return [...kept, { name: "content-length", value: String(byteLength) }];
}
