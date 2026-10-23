import { t } from "../shared/i18n.ts";

/** Tamaño legible: "512 B", "1.2 kB", "3.4 MB". */
export function formatBytes(bytes: number | null): string {
  if (bytes === null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDuration(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

/** Status como texto: número, pendiente o fallido (FR-002). */
export function formatStatus(status: number | null, state: "pending" | "complete" | "failed") {
  if (state === "failed") return t("traffic_status_failed");
  if (status === null) return t("traffic_status_pending");
  return String(status);
}

/** JSON formateado con 2 espacios si el texto es JSON válido; si no, el texto tal cual. */
export function prettyBody(text: string): { text: string; json: boolean } {
  const trimmed = text.trimStart();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return { text, json: false };
  try {
    return { text: JSON.stringify(JSON.parse(text), null, 2), json: true };
  } catch {
    return { text, json: false };
  }
}
