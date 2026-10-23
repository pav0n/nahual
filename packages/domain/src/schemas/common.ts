import { z } from "zod";
import { HTTP_TOKEN, LIMITS } from "./limits.ts";

export const StageSchema = z.enum(["request", "response"]);
export type Stage = z.infer<typeof StageSchema>;

export const HTTP_METHODS = [
  "GET",
  "HEAD",
  "POST",
  "PUT",
  "DELETE",
  "PATCH",
  "OPTIONS",
  "CONNECT",
  "TRACE",
] as const;
export const HttpMethodSchema = z.enum(HTTP_METHODS);
export type HttpMethod = z.infer<typeof HttpMethodSchema>;

/** Valores de `Network.ResourceType` de CDP. */
export const RESOURCE_TYPES = [
  "Document",
  "Stylesheet",
  "Image",
  "Media",
  "Font",
  "Script",
  "TextTrack",
  "XHR",
  "Fetch",
  "Prefetch",
  "EventSource",
  "WebSocket",
  "Manifest",
  "SignedExchange",
  "Ping",
  "CSPViolationReport",
  "Preflight",
  "Other",
] as const;
export const ResourceTypeSchema = z.enum(RESOURCE_TYPES);
export type ResourceType = z.infer<typeof ResourceTypeSchema>;

export const HeaderNameSchema = z
  .string()
  .min(1, { error: "rule_error_required" })
  .max(LIMITS.headerNameMax, { error: "rule_error_too_long" })
  .regex(HTTP_TOKEN, { error: "rule_error_header_name" });

/** Header que el dev escribe (mock, edición): token RFC 9110 y valor sin CR/LF. */
export const EditableHeaderSchema = z.strictObject({
  name: HeaderNameSchema,
  value: z
    .string()
    .max(LIMITS.headerValueMax, { error: "rule_error_too_long" })
    .regex(/^[^\r\n]*$/, { error: "rule_error_header_value" }),
});
export type EditableHeader = z.infer<typeof EditableHeaderSchema>;

/**
 * Header tal como lo envía el servidor o el navegador, solo para mostrarlo. Más permisivo que
 * `EditableHeader` (los servidores mandan valores largos), pero acotado.
 */
export const HeaderSchema = z.strictObject({
  name: z.string().min(1).max(1024),
  value: z.string().max(65_536),
});
export type Header = z.infer<typeof HeaderSchema>;

export const StatusCodeSchema = z
  .int({ error: "rule_error_status" })
  .min(100, { error: "rule_error_status" })
  .max(599, { error: "rule_error_status" });

/** Lista sin duplicados. */
export const uniqueArray = <T extends z.ZodType>(item: T, max: number) =>
  z
    .array(item)
    .max(max)
    .refine((list) => new Set(list).size === list.length, { error: "rule_error_duplicates" });
