/** Lo que necesita `copyText` del navegador; inyectable en las pruebas. */
export interface ClipboardEnv {
  writeText?(text: string): Promise<void>;
  execCommand?(command: "copy"): boolean;
}

const browserEnv = (): ClipboardEnv => ({
  ...(globalThis.navigator?.clipboard
    ? { writeText: (text: string) => navigator.clipboard.writeText(text) }
    : {}),
  ...(globalThis.document
    ? { execCommand: (command: "copy") => document.execCommand(command) }
    : {}),
});

/**
 * Copia dentro del gesto del usuario (003 research R14): `navigator.clipboard` y, si DevTools lo
 * bloquea, `execCommand("copy")` sobre el texto seleccionado de `area`. Sin permiso
 * `clipboardWrite`. `"manual"` = el dev tiene que copiarlo a mano.
 */
export async function copyText(
  text: string,
  area: { focus(): void; select(): void } | null,
  env: ClipboardEnv = browserEnv(),
): Promise<"copied" | "manual"> {
  try {
    if (!env.writeText) throw new Error("no clipboard");
    await env.writeText(text);
    return "copied";
  } catch {
    if (!area || !env.execCommand) return "manual";
    area.focus();
    area.select();
    try {
      return env.execCommand("copy") ? "copied" : "manual";
    } catch {
      return "manual";
    }
  }
}
