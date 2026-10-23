import { headerValues } from "../match/headers.ts";
import type { Header } from "../schemas/common.ts";
import { HTTP_TOKEN } from "../schemas/limits.ts";
import { parseOrigin } from "./origin.ts";
import { headerList } from "./request-headers.ts";

export interface RelaxContext {
  /** Origen exacto de la app: nunca `*`. */
  appOrigin: string;
  credentials: boolean;
  exposeHeaders: readonly string[];
  /** `Access-Control-*` que el dev fijó a mano (en minúsculas): no se tocan (FR-024). */
  pinned?: readonly string[];
}

export interface PreflightRequest {
  /** `Access-Control-Request-Method`. */
  requestMethod: string;
  /** `Access-Control-Request-Headers` tal cual. */
  requestHeaders: string | null;
}

export type RelaxedHeaders =
  | { kind: "response"; headers: Header[]; added: Header[]; removed: Header[] }
  | { kind: "preflight"; status: 204; headers: Header[]; added: Header[]; removed: Header[] }
  | { kind: "not_relaxable" };

/** Headers de permiso que la relajación reemplaza. */
const MANAGED = new Set([
  "access-control-allow-origin",
  "access-control-allow-credentials",
  "access-control-allow-methods",
  "access-control-allow-headers",
  "access-control-expose-headers",
  "access-control-max-age",
]);

const isToken = (value: string) => HTTP_TOKEN.test(value) && value !== "*";

/** `Vary` con `Origin`: la respuesta depende del origen (caché correcta). */
function withVary(headers: Header[]): { headers: Header[]; added: Header | null } {
  const index = headers.findIndex((h) => h.name.toLowerCase() === "vary");
  if (index === -1) {
    const vary = { name: "Vary", value: "Origin" };
    return { headers: [...headers, vary], added: vary };
  }
  const current = headers[index] as Header;
  const values = current.value.split(",").map((v) => v.trim().toLowerCase());
  if (values.includes("origin") || values.includes("*")) return { headers, added: null };
  const vary = { name: current.name, value: `${current.value}, Origin` };
  return { headers: headers.map((h, i) => (i === index ? vary : h)), added: vary };
}

/**
 * Headers de una respuesta relajada (research R7). Con `preflight`, los de un preflight local 204
 * que permite exactamente lo que pidió la app y no deja permiso guardado (`Max-Age: 0`). Nunca
 * produce `*` en `Allow-Origin`, `Allow-Methods`, `Allow-Headers` ni `Expose-Headers`.
 */
export function computeRelaxedHeaders(
  serverHeaders: readonly Header[],
  ctx: RelaxContext,
  preflight?: PreflightRequest,
): RelaxedHeaders {
  if (parseOrigin(ctx.appOrigin) !== ctx.appOrigin) return { kind: "not_relaxable" };
  const pinned = new Set(ctx.pinned ?? []);
  const method = preflight?.requestMethod.trim().toUpperCase();
  const requested = preflight ? [...new Set(headerList(preflight.requestHeaders))] : [];
  if (preflight && (!method || !isToken(method) || !requested.every(isToken)))
    return { kind: "not_relaxable" };

  const removed = serverHeaders.filter((h) => {
    const name = h.name.toLowerCase();
    return MANAGED.has(name) && !pinned.has(name);
  });
  const base = preflight
    ? serverHeaders.filter((h) => pinned.has(h.name.toLowerCase()))
    : serverHeaders.filter((h) => !removed.includes(h));

  const ours: Header[] = [];
  const add = (name: string, value: string) => {
    if (!pinned.has(name.toLowerCase())) ours.push({ name, value });
  };
  add("Access-Control-Allow-Origin", ctx.appOrigin);
  if (ctx.credentials) add("Access-Control-Allow-Credentials", "true");
  if (preflight && method) {
    add("Access-Control-Allow-Methods", method);
    if (requested.length > 0) add("Access-Control-Allow-Headers", requested.sort().join(", "));
    add("Access-Control-Max-Age", "0");
  } else {
    const expose = ctx.exposeHeaders.filter(isToken);
    if (expose.length > 0) add("Access-Control-Expose-Headers", expose.join(", "));
  }
  const vary = withVary([...base, ...ours]);
  const added = vary.added ? [...ours, vary.added] : ours;
  return preflight
    ? { kind: "preflight", status: 204, headers: vary.headers, added, removed }
    : { kind: "response", headers: vary.headers, added, removed };
}

const allowsOrigin = (headers: readonly Header[], appOrigin: string, credentials: boolean) => {
  const values = headerValues(headers, "access-control-allow-origin");
  if (values.length !== 1) return false;
  const value = (values[0] ?? "").trim();
  if (value === appOrigin) return true;
  return value === "*" && !credentials;
};

const allowsCredentials = (headers: readonly Header[], credentials: boolean) =>
  !credentials ||
  headerValues(headers, "access-control-allow-credentials").some((v) => v.trim() === "true");

const listOf = (headers: readonly Header[], name: string) =>
  headerValues(headers, name).flatMap((v) => headerList(v));

/** La respuesta real del servidor ya permite que la app la lea. */
export function responsePasses(
  headers: readonly Header[],
  ctx: { appOrigin: string; credentials: boolean },
): boolean {
  return (
    allowsOrigin(headers, ctx.appOrigin, ctx.credentials) &&
    allowsCredentials(headers, ctx.credentials)
  );
}

const SIMPLE_METHODS = new Set(["GET", "HEAD", "POST"]);

/**
 * El preflight del servidor ya permitiría el request (research R8, versión reducida del
 * algoritmo de Fetch). Si se equivoca hacia "pasa", Chrome lo rechaza como sin Nahual.
 */
export function preflightPasses(
  response: { status: number; headers: readonly Header[] },
  request: { method: string; requestHeaders: readonly string[] },
  ctx: { appOrigin: string; credentials: boolean },
): boolean {
  if (response.status < 200 || response.status >= 300) return false;
  const { headers } = response;
  if (!allowsOrigin(headers, ctx.appOrigin, ctx.credentials)) return false;
  if (!allowsCredentials(headers, ctx.credentials)) return false;
  const method = request.method.toUpperCase();
  const methods = listOf(headers, "access-control-allow-methods").map((m) => m.toUpperCase());
  const methodOk =
    SIMPLE_METHODS.has(method) ||
    methods.includes(method) ||
    (methods.includes("*") && !ctx.credentials);
  if (!methodOk) return false;
  const allowed = listOf(headers, "access-control-allow-headers");
  const wildcard = allowed.includes("*") && !ctx.credentials;
  return request.requestHeaders.every(
    (name) =>
      allowed.includes(name.toLowerCase()) || (wildcard && name.toLowerCase() !== "authorization"),
  );
}
