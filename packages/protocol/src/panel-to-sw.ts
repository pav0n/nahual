import {
  CorsHeaderNameSchema,
  LIMITS,
  PathPatternSchema,
  RepeaterModeSchema,
  RelaxationDurationSchema,
  SettingsPatchSchema,
  SiteSchema,
  utf8Bytes,
} from "@nahual/domain";
import { HOOK_ERROR_TYPES, HookHeadersSchema } from "@nahual/hook-runtime";
import { z } from "zod";
import { message } from "./envelope.ts";

/**
 * Los mensajes del panel que superan este tamaño se descartan antes de parsearlos: un mock, un
 * body editado de 5 MB o un body original del repeater de 5 MB en base64, más sus metadatos
 * (contracts/panel-protocol.md).
 */
export const MAX_PANEL_MESSAGE_CHARS = 8 * 1024 * 1024;

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

/**
 * `productionOrigins` llega sin validar entrada por entrada: el SW la normaliza y responde
 * `issues` con el índice de la inválida (contracts/panel-protocol.md).
 */
const UpdateSettingsSchema = SettingsPatchSchema.omit({ productionOrigins: true })
  .extend({
    productionOrigins: z
      .array(z.string().max(LIMITS.originMax))
      .max(LIMITS.productionOriginsMax)
      .optional(),
  })
  .strict();

/** Los orígenes los valida el SW con sus propios ajustes (`validateRelaxation`). */
const RelaxCorsSchema = z.strictObject({
  appOrigin: z.string().min(1).max(LIMITS.originMax),
  apiOrigin: z.string().min(1).max(LIMITS.originMax),
  durationMinutes: RelaxationDurationSchema,
  exposeHeaders: z.array(CorsHeaderNameSchema).max(LIMITS.exposeHeadersMax),
  credentials: z.boolean(),
});

/** Endpoint de la lista de ignorados (005, research R10): el SW calcula su hash. */
const Endpoint = {
  method: z.string().min(1).max(64),
  url: z.string().min(1).max(LIMITS.urlMax),
};

/** 006: resultado final de una cadena de hooks (contracts/panel-protocol.md). */
const HookFinalSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("unchanged") }),
  z.strictObject({
    kind: z.literal("edit"),
    request: z
      .strictObject({
        method: z.string().min(1).max(64),
        url: z.string().min(1).max(LIMITS.urlMax),
        headers: HookHeadersSchema,
        body: z.string().optional(),
      })
      .optional(),
    response: z
      .strictObject({
        status: z.int().min(0).max(999),
        headers: HookHeadersSchema,
        body: z.string().optional(),
      })
      .optional(),
  }),
  z.strictObject({
    kind: z.literal("respond"),
    status: z.int(),
    headers: HookHeadersSchema,
    body: z.string(),
  }),
]);

export const HOOK_RESULTS = [
  "hooked",
  "hook_unchanged",
  "hook_failed",
  "hook_responded",
  "hook_skipped_suspended",
] as const;

const ProfileName = z.string().max(LIMITS.profileNameMax * 2);
const ProfileIds = z
  .array(z.uuid())
  .max(LIMITS.profilesPerRuleMax)
  .refine((ids) => new Set(ids).size === ids.length);

export const PanelMessageSchema = z.discriminatedUnion("type", [
  // 007: perfiles (contracts/panel-protocol.md). El nombre se valida en el SW con ProfileSchema.
  message("saveProfile", z.strictObject({ id: z.uuid().optional(), name: ProfileName })),
  message("duplicateProfile", z.strictObject({ id: z.uuid(), name: ProfileName })),
  message("deleteProfile", z.strictObject({ id: z.uuid() })),
  message("restoreProfile", z.strictObject({ id: z.uuid() })),
  message("setActiveProfile", z.strictObject({ profileId: z.uuid().nullable() })),
  message("setRuleProfiles", z.strictObject({ ruleId: RuleId, profileIds: ProfileIds })),
  // 007: la configuración llega sin validar aquí; el SW repite parseConfig y los límites (R10).
  message(
    "importConfig",
    z.strictObject({
      /** Lo genera el panel: identifica la importación para deshacerla (10 s). */
      importId: z.uuid(),
      config: Unvalidated,
      source: z.enum(["config", "requestly"]),
      hookChecks: z.record(
        z.uuid(),
        z.strictObject({ hash: z.string().regex(/^[0-9a-f]{1,32}$/), ok: z.boolean() }),
      ),
    }),
  ),
  message("undoImport", z.strictObject({ importId: z.uuid() })),
  // 006: el panel ejecutó la cadena; el SW vuelve a validar antes de aplicar.
  message(
    "hookResult",
    z.strictObject({
      runId: z.uuid(),
      final: HookFinalSchema,
      executions: z
        .array(
          z.strictObject({
            ruleId: RuleId,
            result: z.enum(HOOK_RESULTS),
            durationMs: z.number().min(0),
            errorType: z.enum(HOOK_ERROR_TYPES).optional(),
          }),
        )
        .max(LIMITS.rulesMax),
    }),
  ),
  // 006: importar un archivo .ts siempre crea una regla nueva y desactivada (FR-036).
  message(
    "importHook",
    z.strictObject({
      config: Unvalidated.nullable(),
      source: z.string().refine((s) => utf8Bytes(s) <= LIMITS.hookSourceBytesMax, {
        error: "hook_error_too_large",
      }),
    }),
  ),
  // 005: el request llega sin validar campo por campo; el SW lo valida con RepeaterRequestSchema y
  // responde los issues en repeaterResult (contracts/panel-protocol.md).
  message(
    "repeaterSend",
    z.strictObject({ sendId: z.uuid(), mode: RepeaterModeSchema, request: Unvalidated }),
  ),
  message("repeaterCancel", z.strictObject({ sendId: z.uuid() })),
  message("getIgnores", z.strictObject(Endpoint)),
  message(
    "setIgnores",
    z.strictObject({
      ...Endpoint,
      paths: z.array(PathPatternSchema).max(LIMITS.ignoreEntriesMax),
      headers: z.array(z.string().min(1).max(LIMITS.headerNameMax)).max(LIMITS.ignoreEntriesMax),
    }),
  ),
  message("hello", z.strictObject({ tabId: z.int().min(0) })),
  message("attach", z.strictObject({ consent: z.literal(true).optional() })),
  message("detach", Empty),
  message("reconnect", Empty),
  message("updateSettings", UpdateSettingsSchema),
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
  message("relaxCors", RelaxCorsSchema),
  message("endRelaxation", z.strictObject({ relaxationId: z.uuid().optional() })),
  message(
    "getBody",
    z.strictObject({
      exchangeId: z.string().min(1).max(256),
      side: z.enum(["request", "response"]),
      /** 005: un body de request no textual vuelve en base64 para reenviarlo intacto. */
      binary: z.literal(true).optional(),
    }),
  ),
]);

export type PanelMessage = z.infer<typeof PanelMessageSchema>;
export type PanelMessageType = PanelMessage["type"];
export type PanelPayload<T extends PanelMessageType> = Extract<
  PanelMessage,
  { type: T }
>["payload"];
