/** Lo que necesita `downloadText` del navegador; inyectable en las pruebas. */
export interface DownloadEnv {
  createObjectURL(blob: Blob): string;
  revokeObjectURL(url: string): void;
  createLink(): { href: string; download: string; click(): void };
  defer(fn: () => void): void;
}

const browserEnv = (): DownloadEnv => ({
  createObjectURL: (blob) => URL.createObjectURL(blob),
  revokeObjectURL: (url) => URL.revokeObjectURL(url),
  createLink: () => document.createElement("a"),
  defer: (fn) => void setTimeout(fn, 1_000),
});

/** Descarga sin red ni permiso `downloads`: un `Blob` y un enlace `download` (006, 007 FR-009). */
export function downloadText(
  name: string,
  text: string,
  type = "text/plain",
  env: DownloadEnv = browserEnv(),
) {
  const url = env.createObjectURL(new Blob([text], { type }));
  const link = env.createLink();
  link.href = url;
  link.download = name;
  link.click();
  env.defer(() => env.revokeObjectURL(url));
}
