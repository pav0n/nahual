import type { ConsoleEntry } from "@nahual/hook-runtime";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { t } from "../../../shared/i18n.ts";
import { clearHookConsole, clearHookState, markHookConsoleRead } from "../../hooks/runtime.ts";
import { usePanelStore } from "../../store/index.ts";
import { IconButton } from "../common/IconButton.tsx";
import { Icon } from "../common/icons.tsx";
import { ToggleButton } from "../common/ToggleButton.tsx";
import { Toolbar } from "../common/Toolbar.tsx";
import { hookMessage } from "./HooksTab.tsx";

/** Texto visible de una entrada: los errores llevan tipo, mensaje y línea, como Console. */
function display(entry: ConsoleEntry, revealed: boolean): string {
  const text = revealed && entry.revealed ? entry.revealed : entry.text;
  if (entry.level !== "error") return text;
  try {
    const error = JSON.parse(text) as { type: string; message: string; line: number | null };
    return `${t(`hook_error_type_${error.type}`)}: ${hookMessage(error.message)}${
      error.line ? ` · ${t("hook_line", String(error.line))}` : ""
    }`;
  } catch {
    return text;
  }
}

const pathOf = (url: string) => {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
};

const time = (ms: number) =>
  new Date(ms).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

/**
 * Consola de hooks en el cajón inferior, como Console de DevTools (006, FR-026 a FR-030,
 * contracts/panel-ui.md): barra con limpiar, filtro, niveles, regla, "Mostrar valores sensibles"
 * y "Vaciar estado"; filas con icono de nivel, burbuja de repeticiones y enlace al request.
 */
export function HookConsole() {
  const entries = usePanelStore((s) => s.hookConsole);
  const expanded = usePanelStore((s) => s.drawerExpanded);
  const level = usePanelStore((s) => s.hookConsoleLevel);
  const setLevel = usePanelStore((s) => s.setHookConsoleLevel);
  const rules = usePanelStore((s) => s.rules);
  const [text, setText] = useState("");
  const [ruleId, setRuleId] = useState("");
  const [revealed, setRevealed] = useState(false);
  const list = useRef<HTMLUListElement>(null);

  // Ver la consola marca los errores como leídos (FR-028).
  useEffect(() => {
    if (expanded && entries.some((e) => !e.read)) markHookConsoleRead();
  }, [expanded, entries]);

  const needle = text.toLowerCase();
  const shown = entries.filter(
    (e) =>
      (level === "all" || e.level === "error") &&
      (ruleId === "" || e.ruleId === ruleId) &&
      (needle === "" || display(e, revealed).toLowerCase().includes(needle)),
  );
  const hookRules = rules.filter((r) => r.action.kind === "hook");
  const anySensitive = entries.some((e) => e.revealed !== undefined);

  const openRequest = (exchangeId: string) => {
    const store = usePanelStore.getState();
    store.setSection("traffic");
    store.selectExchange(exchangeId, "hooks");
  };

  /** Flechas entre filas y Enter abre el request (la fila es un enlace). */
  const onKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const links = [...(list.current?.querySelectorAll<HTMLElement>(".console-link") ?? [])];
    const index = links.indexOf(document.activeElement as HTMLElement);
    const next = links[index + (event.key === "ArrowDown" ? 1 : -1)];
    if (!next) return;
    event.preventDefault();
    next.focus();
  };

  return (
    <div className="hook-console">
      <Toolbar label={t("hook_console_toolbar")}>
        <IconButton icon="clear" label={t("hook_console_clear")} onClick={clearHookConsole} />
        <span className="toolbar-separator" />
        <input
          className="console-filter"
          type="search"
          placeholder={t("hook_console_filter")}
          aria-label={t("hook_console_filter")}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <ToggleButton pressed={level === "all"} onChange={() => setLevel("all")}>
          {t("hook_console_logs")}
        </ToggleButton>
        <ToggleButton pressed={level === "error"} onChange={() => setLevel("error")}>
          {t("hook_console_errors")}
        </ToggleButton>
        <select
          aria-label={t("hook_console_rule")}
          value={ruleId}
          onChange={(e) => setRuleId(e.target.value)}
        >
          <option value="">{t("hook_console_all_rules")}</option>
          {hookRules.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
        {anySensitive ? (
          <ToggleButton pressed={revealed} onChange={setRevealed}>
            {t("hook_console_show_sensitive")}
          </ToggleButton>
        ) : null}
        <span className="toolbar-spacer" />
        <button type="button" className="toolbar-text-button" onClick={clearHookState}>
          {t("hook_console_clear_state")}
        </button>
      </Toolbar>
      {entries.length === 0 ? (
        <p className="muted console-empty">{t("hook_console_empty")}</p>
      ) : (
        <ul
          ref={list}
          className="plain console-rows"
          aria-label={t("hook_console_entries")}
          onKeyDown={onKeyDown}
        >
          {shown.map((entry) => (
            <li
              key={entry.id}
              className="console-row"
              data-level={entry.level}
              title={time(entry.at)}
            >
              {entry.level === "error" ? <Icon name="error" /> : null}
              {entry.count > 1 ? (
                <span
                  className="console-count"
                  aria-label={t("hook_console_repeated", String(entry.count))}
                >
                  {entry.count}
                </span>
              ) : null}
              <span className="console-text">{display(entry, revealed)}</span>
              <button
                type="button"
                className="link console-link"
                onClick={() => openRequest(entry.exchangeId)}
              >
                {entry.ruleName} · {entry.request.method} {pathOf(entry.request.url)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
