const OFFSET = 0xcbf29ce484222325n;
const PRIME = 0x100000001b3n;
const MASK64 = 0xffffffffffffffffn;

/**
 * Hash del código de un hook (FNV-1a de 64 bits sobre UTF-8, en hex): liga el `check` del editor
 * al código guardado (FR-016) y es la clave de la caché del sandbox. No es criptográfico.
 */
export function hashSource(text: string): string {
  let hash = OFFSET;
  for (const byte of new TextEncoder().encode(text)) {
    hash ^= BigInt(byte);
    hash = (hash * PRIME) & MASK64;
  }
  return hash.toString(16).padStart(16, "0");
}
