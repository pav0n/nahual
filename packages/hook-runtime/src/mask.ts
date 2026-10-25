import { MASK, isSensitiveHeader } from "@nahual/domain";
import type { HookContextData, HookHeaders } from "./schemas.ts";

const maskHeaders = (headers: HookHeaders): HookHeaders =>
  Object.fromEntries(
    Object.entries(headers).map(([name, value]) => [
      name,
      isSensitiveHeader(name) && value !== "" ? MASK : value,
    ]),
  );

/**
 * Sin el permiso de leer valores sensibles, los headers sensibles llegan al sandbox enmascarados
 * (FR-004, R5): el valor real nunca entra en el entorno no confiable.
 */
export function maskSensitive(ctx: HookContextData, readSensitive: boolean): HookContextData {
  if (readSensitive) return ctx;
  return {
    ...ctx,
    request: { ...ctx.request, headers: maskHeaders(ctx.request.headers) },
    response: ctx.response ? { ...ctx.response, headers: maskHeaders(ctx.response.headers) } : null,
  };
}

const mergeHeaders = (original: HookHeaders, returned: HookHeaders): HookHeaders =>
  Object.fromEntries(
    Object.entries(returned).map(([name, value]) => [
      name,
      value === MASK && isSensitiveHeader(name) && original[name] !== undefined
        ? original[name]
        : value,
    ]),
  );

/** Vuelve a poner los valores reales donde el hook dejó la máscara sin tocar. */
export function mergeMasked(original: HookContextData, returned: HookContextData): HookContextData {
  return {
    ...returned,
    request: {
      ...returned.request,
      headers: mergeHeaders(original.request.headers, returned.request.headers),
    },
    response:
      returned.response && original.response
        ? {
            ...returned.response,
            headers: mergeHeaders(original.response.headers, returned.response.headers),
          }
        : returned.response,
  };
}
