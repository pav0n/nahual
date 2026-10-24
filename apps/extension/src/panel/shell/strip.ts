import type { CommandError, Notice } from "../store/connection.ts";

/** Elementos de la franja de indicadores en su orden fijo (004, data-model `StripItem`, R9). */
export type StripLine = { kind: "notice"; notice: Notice } | { kind: "error"; error: CommandError };

export type StripItem =
  | { kind: "paused" }
  | { kind: "relaxed" }
  | StripLine
  | { kind: "group"; count: number; items: StripLine[] };

export interface StripInput {
  globalPaused: boolean;
  relaxationCount: number;
  notices: Notice[];
  lastError: CommandError | null;
}

/** Con más avisos que esto, se agrupan en una línea "N avisos" (FR-013a). */
export const MAX_NOTICE_LINES = 2;

export function stripItems(state: StripInput): StripItem[] {
  const items: StripItem[] = [];
  if (state.globalPaused) items.push({ kind: "paused" });
  if (state.relaxationCount > 0) items.push({ kind: "relaxed" });
  const lines: StripLine[] = state.notices.map((notice) => ({ kind: "notice", notice }));
  if (state.lastError) lines.push({ kind: "error", error: state.lastError });
  if (lines.length > MAX_NOTICE_LINES)
    items.push({ kind: "group", count: lines.length, items: lines });
  else items.push(...lines);
  return items;
}
