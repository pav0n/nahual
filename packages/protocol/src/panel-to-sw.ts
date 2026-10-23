import { SettingsPatchSchema, SiteSchema } from "@nahual/domain";
import { z } from "zod";
import { message } from "./envelope.ts";

/**
 * Los mensajes del panel que superan este tamaño se descartan antes de parsearlos: un mock o un
 * body editado de 5 MB más sus metadatos (contracts/panel-protocol.md).
 */
export const MAX_PANEL_MESSAGE_CHARS = 6 * 1024 * 1024;

const Empty = z.strictObject({});
const RuleId = z.uuid();
const PausedId = z.string().min(1).max(256);

/**
 * Objeto que el SW valida con los schemas de dominio para responder `issues` por campo; aquí
 * solo se comprueba la forma.
 */
const Unvalidated = z.record(z.string(), z.unknown());

export const RESOLVE_ACTIONS = ["continue", "continueUnchanged", "mock", "abort"] as const;

const ResolvePausedSchema = z
  .strictObject({
    pausedId: PausedId,
    action: z.enum(RESOLVE_ACTIONS),
    edit: Unvalidated.optional(),
    mock: Unvalidated.optional(),
  })
  .refine((p) => p.edit === undefined || p.action === "continue", { path: ["edit"] })
  .refine((p) => (p.action === "mock") === (p.mock !== undefined), { path: ["mock"] });

export const PanelMessageSchema = z.discriminatedUnion("type", [
  message("hello", z.strictObject({ tabId: z.int().min(0) })),
  message("attach", z.strictObject({ consent: z.literal(true).optional() })),
  message("detach", Empty),
  message("reconnect", Empty),
  message("updateSettings", SettingsPatchSchema.strict()),
  message("saveRule", z.strictObject({ rule: Unvalidated })),
  message("deleteRule", z.strictObject({ ruleId: RuleId })),
  message("restoreRule", z.strictObject({ ruleId: RuleId })),
  message(
    "reorderRules",
    z.strictObject({
      site: SiteSchema,
      ruleIds: z
        .array(RuleId)
        .max(500)
        .refine((ids) => new Set(ids).size === ids.length),
    }),
  ),
  message("setRuleEnabled", z.strictObject({ ruleId: RuleId, enabled: z.boolean() })),
  message("resolvePaused", ResolvePausedSchema),
  message("continueAll", Empty),
  message(
    "getBody",
    z.strictObject({
      exchangeId: z.string().min(1).max(256),
      side: z.enum(["request", "response"]),
    }),
  ),
]);

export type PanelMessage = z.infer<typeof PanelMessageSchema>;
export type PanelMessageType = PanelMessage["type"];
export type PanelPayload<T extends PanelMessageType> = Extract<
  PanelMessage,
  { type: T }
>["payload"];
