import { HookFileConfigSchema, type HookFileConfig } from "@nahual/domain";

const HEADER = "/* @nahual-hook 1\n";
const CLOSE = "\n*/\n";

/** Lo que se exporta de una regla (contracts/hook-file.md). Nada más sale del panel. */
const exported = (config: HookFileConfig): HookFileConfig => ({
  name: config.name,
  stage: config.stage,
  prefilter: config.prefilter,
  methods: config.methods,
  resourceTypes: config.resourceTypes,
  conditions: config.conditions,
});

/**
 * Archivo `.ts` de un hook (006, FR-035): la configuración de la regla en un comentario inicial y
 * el código debajo. Toda `/` precedida de `*` se escribe `\/` (escape válido de JSON), para que un
 * prefiltro como `*\/api/*` no cierre el comentario.
 */
export function serializeHookFile(config: HookFileConfig, source: string): string {
  const json = JSON.stringify(exported(config), null, 2).replaceAll("*/", "*\\/");
  return `${HEADER}${json}${CLOSE}${source}`;
}

export type ParsedHookFile =
  | { config: HookFileConfig; source: string }
  | {
      config: null;
      configError: "hook_file_no_config" | "hook_file_bad_json" | "hook_file_bad_config";
      source: string;
    };

/** Inversa de `serializeHookFile`. Sin bloque o con uno inválido, devuelve solo el código. */
export function parseHookFile(text: string): ParsedHookFile {
  if (!text.startsWith(HEADER))
    return { config: null, configError: "hook_file_no_config", source: text };
  const end = text.indexOf(CLOSE, HEADER.length - 1);
  if (end < 0) return { config: null, configError: "hook_file_bad_json", source: text };
  const source = text.slice(end + CLOSE.length);
  let raw: unknown;
  try {
    raw = JSON.parse(text.slice(HEADER.length, end));
  } catch {
    return { config: null, configError: "hook_file_bad_json", source };
  }
  const parsed = HookFileConfigSchema.safeParse(raw);
  return parsed.success
    ? { config: parsed.data, source }
    : { config: null, configError: "hook_file_bad_config", source };
}
