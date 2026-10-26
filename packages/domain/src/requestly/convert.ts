import type { Stage } from "../schemas/common.ts";
import { LIMITS } from "../schemas/limits.ts";
import { CONFIG_VERSION } from "../portable/migrate.ts";
import {
  PortableRuleSchema,
  type PortableAction,
  type PortableConfigV1,
  type PortableProfile,
  type PortableRule,
} from "../portable/schema.ts";
import {
  RequestlyExportSchema,
  RequestlyGroupSchema,
  RequestlyPairSchema,
  RequestlyRuleSchema,
  type RequestlyModification,
  type RequestlyPair,
  type RequestlyRule,
} from "./schema.ts";
import { sourceToMatch, type SourceMatch } from "./source.ts";
import { headersHook, redirectHook } from "./templates.ts";

export interface Unsupported {
  name: string;
  reasonKey: string;
}

export type ConvertResult =
  | { ok: true; config: PortableConfigV1; unsupported: Unsupported[] }
  | { ok: false; errorKey: "requestly_error_format" };

/** Regla de Nahual sin identidad todavía: lo que produce una pareja. */
type Piece = { suffix: string | null; stage: Stage; match: SourceMatch; action: PortableAction };
type Pieces = Piece[] | { reasonKey: string };

const SUPPORTED = new Set(["Redirect", "Headers", "Response"]);
const reason = (key: string) => ({ reasonKey: `requestly_unsupported_${key}` });

function isJson(text: string) {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

function piecesOf(rule: RequestlyRule, pair: RequestlyPair): Pieces {
  if (!pair.source) return reason("empty_pairs");
  const match = sourceToMatch(pair.source);
  if ("reasonKey" in match) return match;
  const source = pair.source;

  if (rule.ruleType === "Redirect") {
    if (pair.destinationType !== undefined && pair.destinationType !== "url")
      return reason("redirect_destination");
    if (!pair.destination) return reason("redirect_destination");
    const code = redirectHook(rule.name, source, pair.destination);
    return [{ suffix: null, stage: "request", match, action: { kind: "hook", source: code } }];
  }

  if (rule.ruleType === "Headers") {
    const mods = pair.modifications;
    const byStage: [Stage, readonly RequestlyModification[]][] = Array.isArray(mods)
      ? [["request", mods]]
      : [
          ["request", mods?.Request ?? []],
          ["response", mods?.Response ?? []],
        ];
    const stages = byStage.filter(([, list]) => list.length > 0);
    if (stages.length === 0) return reason("empty_pairs");
    if (stages.some(([, list]) => list.some((m) => !["Add", "Modify", "Remove"].includes(m.type))))
      return reason("rule_type");
    return stages.map(([stage, list]) => ({
      suffix: stages.length > 1 ? stage : null,
      stage,
      match,
      action: { kind: "hook", source: headersHook(rule.name, source, stage, list) },
    }));
  }

  if (rule.ruleType === "Response") {
    const response = pair.response;
    if (!response) return reason("empty_pairs");
    if (response.type !== "static") return reason("response_code");
    const status = response.statusCode === undefined ? 200 : Number(response.statusCode);
    return [
      {
        suffix: null,
        // Sin request: responde desde la etapa Request, sin red (contracts/requestly-import.md).
        stage: response.serveWithoutRequest ? "request" : "response",
        match,
        action: {
          kind: "mock",
          status,
          headers: [
            {
              name: "content-type",
              value: isJson(response.value) ? "application/json" : "text/plain",
            },
          ],
          body: response.value,
          bodyEncoding: "text",
        },
      },
    ];
  }

  return reason("rule_type");
}

const nameWith = (name: string, parts: string[]) => {
  const suffix = parts.length ? ` (${parts.join(", ")})` : "";
  return `${name.trim().slice(0, LIMITS.ruleNameMax - suffix.length)}${suffix}`;
};

/**
 * Export de Requestly ⇒ configuración portable del sitio de la pestaña (007, FR-034 a FR-038,
 * contracts/requestly-import.md). Una regla entra entera o no entra: si una pareja no se puede
 * reproducir, la regla va a `unsupported` con el motivo. Todo queda desactivado (FR-032).
 */
export function convertRequestly(
  input: unknown,
  site: string,
  newId: () => string = () => crypto.randomUUID(),
): ConvertResult {
  const parsed = RequestlyExportSchema.safeParse(input);
  if (!parsed.success || !parsed.data.some((r) => r.objectType === "rule"))
    return { ok: false, errorKey: "requestly_error_format" };

  const groups = new Map<string, string>();
  for (const record of parsed.data) {
    const group = RequestlyGroupSchema.safeParse(record);
    if (group.success) groups.set(group.data.id, group.data.name);
  }

  const rules: PortableRule[] = [];
  const unsupported: Unsupported[] = [];
  const profileIds = new Map<string, string>();
  const profileOf = (groupId: string | null | undefined) => {
    if (!groupId || !groups.has(groupId)) return [];
    let id = profileIds.get(groupId);
    if (!id) {
      id = newId();
      profileIds.set(groupId, id);
    }
    return [id];
  };

  for (const record of parsed.data) {
    if (record.objectType !== "rule") continue;
    const rule = RequestlyRuleSchema.safeParse(record);
    if (!rule.success) {
      const name = typeof record.name === "string" && record.name ? record.name : "?";
      unsupported.push({ name, reasonKey: "requestly_unsupported_invalid" });
      continue;
    }
    const { name, pairs, ruleType } = rule.data;
    const converted: Piece[][] = [];
    let failed: string | null = !SUPPORTED.has(ruleType)
      ? "requestly_unsupported_rule_type"
      : pairs.length === 0
        ? "requestly_unsupported_empty_pairs"
        : null;
    for (const raw of pairs) {
      if (failed) break;
      const pair = RequestlyPairSchema.safeParse(raw);
      const pieces = pair.success ? piecesOf(rule.data, pair.data) : reason("invalid");
      if ("reasonKey" in pieces) failed = pieces.reasonKey;
      else converted.push(pieces);
    }
    if (failed) {
      unsupported.push({ name, reasonKey: failed });
      continue;
    }
    // Se validan antes de añadir nada: la regla entra entera o no entra (FR-036).
    const ids = profileOf(rule.data.groupId);
    const built: PortableRule[] = [];
    converted.forEach((pieces, index) => {
      for (const piece of pieces) {
        const parts = [
          ...(converted.length > 1 ? [String(index + 1)] : []),
          ...(piece.suffix ? [piece.suffix] : []),
        ];
        built.push({
          id: newId(),
          order: rules.length + built.length,
          name: nameWith(name, parts),
          enabled: false,
          prefilter: piece.match.prefilter,
          methods: piece.match.methods,
          resourceTypes: piece.match.resourceTypes,
          stage: piece.stage,
          conditions: [],
          profileIds: ids,
          action: piece.action,
        });
      }
    });
    if (built.some((r) => !PortableRuleSchema.safeParse(r).success)) {
      unsupported.push({ name, reasonKey: "requestly_unsupported_invalid" });
      continue;
    }
    rules.push(...built);
  }

  // Un grupo sin reglas importadas no se crea; nombres repetidos se numeran.
  const used = new Set(rules.flatMap((r) => r.profileIds));
  const taken = new Set<string>();
  const profiles: PortableProfile[] = [];
  for (const [groupId, id] of profileIds) {
    if (!used.has(id)) continue;
    const base =
      (groups.get(groupId) ?? "").trim().slice(0, LIMITS.profileNameMax - 4) || "Requestly";
    let profileName = base;
    for (let n = 2; taken.has(profileName.toLocaleLowerCase()); n++) profileName = `${base} (${n})`;
    taken.add(profileName.toLocaleLowerCase());
    profiles.push({ id, name: profileName });
  }

  return {
    ok: true,
    unsupported,
    config: {
      nahual: "config",
      version: CONFIG_VERSION,
      app: "requestly",
      exportedAt: new Date().toISOString(),
      redacted: { count: 0, rules: [] },
      productionOrigins: [],
      sites: [{ site, profiles, rules: rules.slice(0, LIMITS.rulesMax) }],
    },
  };
}
