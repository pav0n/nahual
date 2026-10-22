import { z } from "zod";
import { message } from "./envelope.ts";

/** Token HTTP (RFC 9110, sección 5.6.2). */
const HTTP_TOKEN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

export const StageSchema = z.enum(["request", "response"]);
export type Stage = z.infer<typeof StageSchema>;

export const InterceptionPatternSchema = z.strictObject({
  urlPattern: z.string().min(1).max(2048).regex(/^\S+$/, "sin espacios"),
  stage: StageSchema,
});
export type InterceptionPattern = z.infer<typeof InterceptionPatternSchema>;

export const MAX_PATTERNS = 10;
export const MIN_PAUSE_TIMEOUT_SECONDS = 5;
export const MAX_PAUSE_TIMEOUT_SECONDS = 120;
export const DEFAULT_PAUSE_TIMEOUT_SECONDS = 30;

export const HeaderEditSchema = z.strictObject({
  name: z.string().min(1).max(256).regex(HTTP_TOKEN, "token HTTP"),
  /** `null` elimina el header; otro valor lo añade o reemplaza. */
  value: z
    .string()
    .max(8192)
    .regex(/^[^\r\n]*$/, "sin saltos de línea")
    .nullable(),
});
export type HeaderEdit = z.infer<typeof HeaderEditSchema>;

const Empty = z.strictObject({});

export const PanelMessageSchema = z.discriminatedUnion("type", [
  message("hello", z.strictObject({ tabId: z.int().min(0) })),
  message("attach", Empty),
  message("detach", Empty),
  message("reconnect", Empty),
  message(
    "setPatterns",
    z.strictObject({ patterns: z.array(InterceptionPatternSchema).max(MAX_PATTERNS) }),
  ),
  message(
    "setPauseTimeout",
    z.strictObject({
      seconds: z.int().min(MIN_PAUSE_TIMEOUT_SECONDS).max(MAX_PAUSE_TIMEOUT_SECONDS),
    }),
  ),
  message(
    "continue",
    z.strictObject({
      pausedId: z.string().min(1).max(256),
      headers: z.array(HeaderEditSchema).max(50).optional(),
    }),
  ),
]);

export type PanelMessage = z.infer<typeof PanelMessageSchema>;
export type PanelMessageType = PanelMessage["type"];
export type PanelPayload<T extends PanelMessageType> = Extract<
  PanelMessage,
  { type: T }
>["payload"];
