import { LIMITS, redactLogText } from "@nahual/domain";

export type ConsoleLevel = "log" | "error";

export interface ConsoleInput {
  level: ConsoleLevel;
  text: string;
  ruleId: string;
  ruleName: string;
  request: { method: string; url: string };
  exchangeId: string;
  at: number;
}

/** Entrada de la consola de hooks (data-model, `ConsoleEntry`). */
export interface ConsoleEntry extends ConsoleInput {
  id: number;
  /** Repeticiones consecutivas agrupadas (como Console de DevTools). */
  count: number;
  read: boolean;
  /** Texto real si se redactó algo (solo memoria, para "Mostrar valores sensibles"). */
  revealed?: string;
}

export interface ConsoleFilter {
  levels?: ConsoleLevel[];
  ruleId?: string;
  text?: string;
}

/**
 * Consola de hooks (006, FR-026, FR-027, FR-030, research R11): anillo de 1,000 entradas, errores
 * consecutivos iguales del mismo hook agrupados, texto recortado a 10 KB y redactado por nombre.
 * Solo memoria (FR-029).
 */
export function createHookConsole() {
  let list: ConsoleEntry[] = [];
  let seq = 0;
  return {
    add(input: ConsoleInput) {
      const raw = input.text.slice(0, LIMITS.hookLogEntryChars);
      const text = redactLogText(raw);
      const last = list.at(-1);
      if (
        last &&
        input.level === "error" &&
        last.level === "error" &&
        last.ruleId === input.ruleId &&
        last.text === text
      ) {
        last.count += 1;
        last.read = false;
        last.at = input.at;
        return;
      }
      list.push({
        ...input,
        text,
        id: ++seq,
        count: 1,
        read: false,
        ...(text === raw ? {} : { revealed: raw }),
      });
      if (list.length > LIMITS.hookConsoleEntriesMax)
        list = list.slice(list.length - LIMITS.hookConsoleEntriesMax);
    },
    entries: (): readonly ConsoleEntry[] => list,
    filter({ levels, ruleId, text }: ConsoleFilter): ConsoleEntry[] {
      const needle = text?.toLowerCase() ?? "";
      return list.filter(
        (e) =>
          (!levels || levels.includes(e.level)) &&
          (!ruleId || e.ruleId === ruleId) &&
          (needle === "" || e.text.toLowerCase().includes(needle)),
      );
    },
    unreadErrors: () =>
      list.reduce((sum, e) => sum + (e.level === "error" && !e.read ? e.count : 0), 0),
    markRead() {
      for (const e of list) e.read = true;
    },
    /** "Limpiar consola": devuelve lo que había para "Deshacer". */
    clear(): ConsoleEntry[] {
      const previous = list;
      list = [];
      return previous;
    },
    restore(previous: ConsoleEntry[]) {
      list = [...previous, ...list].slice(-LIMITS.hookConsoleEntriesMax);
    },
  };
}

export type HookConsole = ReturnType<typeof createHookConsole>;
