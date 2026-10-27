import { LIMITS, type Profile, type Rule } from "@nahual/domain";
import type { ParseResult, PortableConfigV1 } from "@nahual/domain/portable";
import { t } from "../../shared/i18n.ts";
import { command } from "../commands.ts";
import type { TypesCheck } from "../hooks/types-client.ts";
import { usePanelStore } from "../store/index.ts";

/** Lee un archivo de configuración: hasta 10 MB y UTF-8 estricto (FR-029). */
export async function readImportFile(
  file: File,
): Promise<{ ok: true; text: string } | { ok: false; errorKey: string }> {
  if (file.size > LIMITS.importFileBytesMax)
    return { ok: false, errorKey: "config_error_too_large" };
  try {
    return {
      ok: true,
      text: new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer()),
    };
  } catch {
    return { ok: false, errorKey: "config_error_not_json" };
  }
}

/** Lo que ya hay en el navegador, para los límites sumados y la vista previa. */
export function existingConfig(): {
  rules: Rule[];
  profiles: Profile[];
  productionOrigins: string[];
} {
  const s = usePanelStore.getState();
  return {
    rules: s.rules,
    profiles: s.profiles,
    productionOrigins: s.settings?.productionOrigins ?? [],
  };
}

/** Valida el texto con el módulo portable, que se carga aquí y no en la carga inicial (T069). */
export async function parseImport(text: string): Promise<ParseResult> {
  const { parseConfig } = await import("@nahual/domain/portable");
  return parseConfig(text, existingConfig(), (name) => t("profile_imported_name", name));
}

/**
 * Convierte un export de Requestly para el sitio de la pestaña y lo valida como cualquier
 * configuración (007, FR-034 a FR-037). El conversor se carga solo aquí.
 */
export async function parseRequestly(
  text: string,
): Promise<
  | (Extract<ParseResult, { ok: true }> & { unsupported: { name: string; reasonKey: string }[] })
  | { ok: false; message: string }
> {
  const site = usePanelStore.getState().session?.site;
  if (!site) return { ok: false, message: t("requestly_error_no_site") };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, message: t("config_error_not_json") };
  }
  const [{ convertRequestly }, { parseConfigObject }] = await Promise.all([
    import("@nahual/domain/requestly"),
    import("@nahual/domain/portable"),
  ]);
  const converted = convertRequestly(raw, site);
  if (!converted.ok) return { ok: false, message: t(converted.errorKey) };
  const parsed = parseConfigObject(converted.config, existingConfig(), (name) =>
    t("profile_imported_name", name),
  );
  if (!parsed.ok) return { ok: false, message: rejectionText(parsed) };
  return { ...parsed, unsupported: converted.unsupported };
}

/** Mensaje de un rechazo, con causa y solución (FR-029, principio III). */
export function rejectionText(result: Extract<ParseResult, { ok: false }>): string {
  if (result.errorKey === "config_error_invalid") return t(result.errorKey, result.path ?? "");
  if (result.errorKey === "config_error_limit") return t(result.errorKey, result.params ?? []);
  return t(result.errorKey);
}

export interface HookReview {
  ruleId: string;
  name: string;
  source: string;
  result: TypesCheck;
}

/**
 * Analiza cada hook del archivo con el Worker de tipos de 006 antes de importar: el `check` viaja
 * en `importConfig` y el SW lo acepta solo si el hash coincide (FR-016 de 006).
 */
export async function reviewHooks(config: PortableConfigV1): Promise<HookReview[]> {
  const hooks = config.sites.flatMap((s) =>
    s.rules.flatMap((r) =>
      r.action.kind === "hook" ? [{ ruleId: r.id, name: r.name, source: r.action.source }] : [],
    ),
  );
  if (hooks.length === 0) return [];
  const { createTypesClient } = await import("../hooks/types-client.ts");
  const client = createTypesClient();
  try {
    const reviews: HookReview[] = [];
    for (const hook of hooks) reviews.push({ ...hook, result: await client.check(hook.source) });
    return reviews;
  } finally {
    client.dispose();
  }
}

/** Importa y ofrece "Deshacer" durante 10 s (FR-031). */
export async function confirmImport(
  config: PortableConfigV1,
  source: "config" | "requestly",
  reviews: readonly HookReview[],
) {
  const importId = crypto.randomUUID();
  const reply = await command("importConfig", {
    importId,
    config: config as unknown as Record<string, unknown>,
    source,
    hookChecks: Object.fromEntries(reviews.map((r) => [r.ruleId, r.result.check])),
  });
  if (reply.ok) {
    const rules = config.sites.reduce((n, s) => n + s.rules.length, 0);
    const profiles = config.sites.reduce((n, s) => n + s.profiles.length, 0);
    usePanelStore.getState().pushToast({
      messageKey: "config_imported_undo",
      params: [String(rules), String(profiles)],
      actionKey: "action_undo",
      onAction: () => void command("undoImport", { importId }),
    });
  }
  return reply;
}
