const REGEX_SPECIAL = /[.*+?^${}()|[\]\\/]/g;

/**
 * Convierte un glob de prefiltro a una regex anclada a la URL completa (research R3). Misma
 * sintaxis que `Fetch.RequestPattern.urlPattern`: `*` = cualquier secuencia (incluida `/`),
 * `?` = un carácter, `\` escapa el siguiente carácter y el resto es literal.
 */
export function globToRegExp(glob: string): RegExp {
  let source = "^";
  for (let i = 0; i < glob.length; i++) {
    const char = glob[i] as string;
    if (char === "\\" && i + 1 < glob.length) {
      source += (glob[++i] as string).replace(REGEX_SPECIAL, "\\$&");
    } else if (char === "*") {
      source += "[\\s\\S]*";
    } else if (char === "?") {
      source += "[\\s\\S]";
    } else {
      source += char.replace(REGEX_SPECIAL, "\\$&");
    }
  }
  return new RegExp(`${source}$`);
}

export const matchesGlob = (glob: string, url: string) => globToRegExp(glob).test(url);
