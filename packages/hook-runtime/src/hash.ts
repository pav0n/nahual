/**
 * Hash del código de un hook (FNV-1a de 64 bits sobre UTF-8, en hex): liga el `check` del editor
 * al código guardado (FR-016) y es la clave de la caché del sandbox. No es criptográfico.
 * Aritmética en cuatro trozos de 16 bits: con `BigInt` por byte, 100 KB tardaban decenas de ms.
 */
export function hashSource(text: string): string {
  // Base 0xcbf29ce484222325, de menor a mayor.
  let h0 = 0x2325;
  let h1 = 0x8422;
  let h2 = 0x9ce4;
  let h3 = 0xcbf2;
  for (const byte of new TextEncoder().encode(text)) {
    h0 ^= byte;
    // × 0x100000001b3 (mod 2^64): 0x1b3 en el trozo 0 y 0x100 en el trozo 2.
    const t0 = h0 * 0x1b3;
    let t1 = h1 * 0x1b3;
    let t2 = h2 * 0x1b3 + (h0 << 8);
    const t3 = h3 * 0x1b3 + (h1 << 8);
    t1 += t0 >>> 16;
    h0 = t0 & 0xffff;
    t2 += t1 >>> 16;
    h1 = t1 & 0xffff;
    h3 = (t3 + (t2 >>> 16)) & 0xffff;
    h2 = t2 & 0xffff;
  }
  return [h3, h2, h1, h0].map((part) => part.toString(16).padStart(4, "0")).join("");
}
