import {
  formatPath,
  type HeaderChange,
  type JsonChange,
  type PathPattern,
  type PathSegment,
  type RevealedValues,
} from "@nahual/domain";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { t } from "../../../shared/i18n.ts";
import { formatBytes } from "../../format.ts";
import {
  comparableOf,
  endpointRequest,
  sameSide,
  sendNumber,
  sidesOf,
  type SideRef,
} from "../../repeater/compare.ts";
import { createDiffClient, type DiffOutcome } from "../../repeater/diff-client.ts";
import type { RepeaterTab } from "../../repeater/types.ts";
import { matchesShortcut, shortcutById } from "../../shortcuts.ts";
import { sw } from "../../sw-client.ts";

const NEXT = shortcutById("nextChange");
const PREV = shortcutById("prevChange");
const SYMBOL = { added: "+", removed: "−", changed: "~" } as const;

const isEditable = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

/** Valor de un cambio como texto (nunca HTML), recortado para la lista. */
const show = (value: unknown) => {
  if (value === undefined) return "";
  const text = typeof value === "string" ? JSON.stringify(value) : JSON.stringify(value);
  return text.length > 300 ? `${text.slice(0, 300)}…` : text;
};

/** "Ignorar en todos los elementos": el último segmento de array pasa a `[*]`. */
function anyElement(path: PathSegment[]): PathPattern | null {
  const index = path.findLastIndex((s) => !("key" in s));
  if (index < 0) return null;
  return path.map((s, i) => (i === index ? { any: true as const } : s));
}

function patternLabel(pattern: PathPattern) {
  return formatPath(pattern.map((s) => ("any" in s ? { key: "*" } : s))).replace('["*"]', "[*]");
}

interface Ignored {
  paths: PathPattern[];
  headers: string[];
}

/**
 * Diff entre dos respuestas de una pestaña (005, US2): lados rotulados e intercambiables
 * (FR-023), status y headers (FR-024), body por estructura, por líneas o solo metadatos (FR-025 a
 * FR-027), ignorados por endpoint (FR-028, FR-029), valores sensibles redactados salvo acción
 * explícita (FR-030), cambios con `+`, `−` y `~` además del color (FR-031) y `J`/`K` (FR-032).
 */
export function DiffView({
  tab,
  initial,
  onClose,
}: {
  tab: RepeaterTab;
  initial: { before: SideRef; after: SideRef };
  onClose(): void;
}) {
  const [before, setBefore] = useState<SideRef>(initial.before);
  const [after, setAfter] = useState<SideRef>(initial.after);
  const [ignores, setIgnores] = useState<Ignored | null>(null);
  /** Resultado de la última comparación pedida, con su clave: otra clave ⇒ "Comparando…". */
  const [done, setDone] = useState<{ key: string; outcome: DiffOutcome } | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [showIgnored, setShowIgnored] = useState(false);
  const client = useMemo(() => createDiffClient(), []);
  const listRef = useRef<HTMLDivElement>(null);
  const endpoint = endpointRequest(tab, after, before);

  useEffect(() => () => client.cancel(), [client]);

  // Ignorados del endpoint (FR-029).
  useEffect(() => {
    let live = true;
    void sw.send("getIgnores", { method: endpoint.method, url: endpoint.url }).then((reply) => {
      const event = reply.ok ? reply.events.find((e) => e.type === "ignores") : undefined;
      if (!live) return;
      setIgnores(
        event?.type === "ignores"
          ? { paths: event.payload.paths, headers: event.payload.headers }
          : { paths: [], headers: [] },
      );
    });
    return () => {
      live = false;
    };
  }, [endpoint.method, endpoint.url]);

  const left = comparableOf(tab, before);
  const right = comparableOf(tab, after);
  // Clave de la comparación: cambia con los lados, sus datos y los ignorados.
  const key = JSON.stringify([
    before,
    after,
    ignores,
    tab.sends.find((s) => before.kind === "send" && s.sendId === before.sendId)?.state,
    tab.sends.find((s) => after.kind === "send" && s.sendId === after.sendId)?.state,
    tab.pasted?.text.length ?? null,
  ]);
  useEffect(() => {
    if (!ignores || !left || !right) return;
    void client.compare(left, right, ignores).then((result) => {
      if (!(result.ok === false && result.reason === "cancelled"))
        setDone({ key, outcome: result });
    });
    // `key` resume los lados y los ignorados: no hace falta comparar los objetos.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, key]);
  const outcome = done?.key === key ? done.outcome : null;

  const saveIgnores = (next: Ignored) => {
    setIgnores(next);
    void sw.send("setIgnores", { method: endpoint.method, url: endpoint.url, ...next });
  };
  const ignorePath = (pattern: PathPattern) =>
    ignores && saveIgnores({ ...ignores, paths: [...ignores.paths, pattern] });
  const ignoreHeader = (name: string) =>
    ignores && saveIgnores({ ...ignores, headers: [...ignores.headers, name] });

  const label = (ref: SideRef) => {
    if (ref.kind === "original") return t("diff_side_original");
    if (ref.kind === "pasted") return t("diff_side_pasted");
    const send = tab.sends.find((s) => s.sendId === ref.sendId);
    const time = send ? new Date(send.startedAt).toLocaleTimeString() : "";
    return t("diff_side_send", [String(sendNumber(tab, ref.sendId) ?? "?"), time]);
  };
  const options = sidesOf(tab);
  const optionKey = (ref: SideRef) => (ref.kind === "send" ? `send:${ref.sendId}` : ref.kind);
  const fromKey = (key: string) => options.find((o) => optionKey(o) === key) ?? before;

  const move = (direction: 1 | -1) => {
    const items = [...(listRef.current?.querySelectorAll<HTMLElement>("[data-change]") ?? [])];
    if (items.length === 0) return;
    const index = items.findIndex(
      (el) => el === document.activeElement || el.contains(document.activeElement),
    );
    const next = items[(index + direction + items.length) % items.length] ?? items[0];
    next?.focus();
    next?.scrollIntoView({ block: "nearest" });
  };
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      // Tampoco llega a DevTools, que abriría el cajón de la consola (004, D2).
      event.stopPropagation();
      onClose();
      return;
    }
    if (isEditable(event.target)) return;
    if (matchesShortcut(NEXT, event)) {
      event.preventDefault();
      move(1);
    } else if (matchesShortcut(PREV, event)) {
      event.preventDefault();
      move(-1);
    }
  };

  const result = outcome?.ok ? outcome.result : null;
  const secrets: RevealedValues | null = outcome?.ok ? outcome.revealed : null;
  const hasSensitive =
    result !== null &&
    (result.headers.some((h) => h.sensitive) ||
      (result.body.mode === "json" && result.body.changes.some((c) => c.sensitive)) ||
      (result.body.mode === "lines" &&
        result.body.hunks.some((h) => h.lines.some((l) => l.sensitive))));

  return (
    <section className="diff-view" aria-labelledby="diff-title" onKeyDown={onKeyDown}>
      <div className="row diff-header">
        <h3 id="diff-title">{t("diff_title")}</h3>
        <label className="diff-side">
          <span className="diff-side-label">{t("diff_before")}</span>
          <select value={optionKey(before)} onChange={(e) => setBefore(fromKey(e.target.value))}>
            {options.map((o) => (
              <option key={optionKey(o)} value={optionKey(o)}>
                {label(o)}
              </option>
            ))}
          </select>
        </label>
        <label className="diff-side">
          <span className="diff-side-label">{t("diff_after")}</span>
          <select value={optionKey(after)} onChange={(e) => setAfter(fromKey(e.target.value))}>
            {options.map((o) => (
              <option key={optionKey(o)} value={optionKey(o)}>
                {label(o)}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => {
            setBefore(after);
            setAfter(before);
          }}
        >
          {t("diff_swap")}
        </button>
        <button type="button" onClick={onClose}>
          {t("diff_close")}
        </button>
      </div>

      {!left || !right ? (
        <p className="field-warning">{t("diff_side_missing")}</p>
      ) : sameSide(before, after) ? (
        <p className="muted">{t("diff_same_side")}</p>
      ) : null}

      {left && right && !outcome ? (
        <p className="muted" aria-busy="true">
          {t("diff_comparing")}{" "}
          <button type="button" onClick={() => client.cancel()}>
            {t("action_cancel")}
          </button>
        </p>
      ) : null}
      {outcome && !outcome.ok ? (
        <p role="alert" className="alert">
          {t(`diff_failed_${outcome.reason}`)}
        </p>
      ) : null}

      {result ? (
        <>
          <div className="row diff-summary" role="status">
            <strong>
              {result.total === 0 ? t("diff_no_changes") : t("diff_total", String(result.total))}
            </strong>
            {result.ignored.headers.length + result.ignored.body.length > 0 ? (
              <button
                type="button"
                className="link"
                aria-pressed={showIgnored}
                onClick={() => setShowIgnored(!showIgnored)}
              >
                {t(
                  "diff_ignored_count",
                  String(result.ignored.headers.length + result.ignored.body.length),
                )}
              </button>
            ) : null}
            {result.total > 0 ? (
              <>
                <button type="button" onClick={() => move(-1)} aria-keyshortcuts="K">
                  {t("diff_prev")}
                </button>
                <button type="button" onClick={() => move(1)} aria-keyshortcuts="J">
                  {t("diff_next")}
                </button>
              </>
            ) : null}
            {hasSensitive ? (
              <button type="button" aria-pressed={revealed} onClick={() => setRevealed(!revealed)}>
                {t(revealed ? "diff_hide_sensitive" : "diff_show_sensitive")}
              </button>
            ) : null}
          </div>
          {result.notes.map((note) => (
            <p key={note} className="field-warning" role="note">
              {t(`diff_note_${note}`)}
            </p>
          ))}
          {result.body.mode === "json" && result.body.arrays.length > 0 ? (
            <p className="muted">
              {t(
                "diff_arrays",
                result.body.arrays
                  .slice(0, 5)
                  .map((a) =>
                    t("diff_array_criterion", [
                      formatPath(a.path),
                      a.criterion === "index" ? t("diff_by_index") : t("diff_by_id", a.criterion),
                    ]),
                  )
                  .join("; "),
              )}
            </p>
          ) : null}

          <div className="diff-changes" ref={listRef}>
            {result.status ? (
              <ChangeItem kind="changed" label={t("diff_status")}>
                <span className="mono">
                  {result.status.before} → {result.status.after}
                </span>
              </ChangeItem>
            ) : null}
            {result.headers.map((change, index) => (
              <HeaderItem
                key={`h${index}`}
                change={change}
                real={revealed ? secrets?.headers[index] : undefined}
                onIgnore={() => ignoreHeader(change.name)}
              />
            ))}
            {result.body.mode === "json"
              ? result.body.changes.map((change, index) => (
                  <JsonItem
                    key={`j${index}`}
                    change={change}
                    real={revealed ? secrets?.body[index] : undefined}
                    onIgnore={ignorePath}
                  />
                ))
              : null}
            {result.body.mode === "lines" ? (
              <div className="diff-lines mono">
                {result.body.hunks.map((hunk, h) => (
                  <div key={h} className="diff-hunk">
                    <p className="muted">
                      {t("diff_hunk", [String(hunk.beforeStart), String(hunk.afterStart)])}
                    </p>
                    {hunk.lines.map((line, i) => {
                      const text = revealed
                        ? (secrets?.lines[`${h}:${i}`] ?? line.text)
                        : line.text;
                      if (line.op === " ")
                        return (
                          <div key={i} className="diff-line">
                            <span aria-hidden="true">{"  "}</span>
                            {text}
                          </div>
                        );
                      const kind = line.op === "+" ? "added" : "removed";
                      return (
                        <div key={i} className={`diff-line diff-${kind}`} data-change tabIndex={-1}>
                          <span aria-hidden="true">{`${SYMBOL[kind]} `}</span>
                          <span className="visually-hidden">{t(`diff_kind_${kind}`)}: </span>
                          {text}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            ) : null}
            {result.body.mode === "metadata" ? (
              <p className="muted">
                {t("diff_metadata", [
                  sizeText(result.body.before.size),
                  t(`diff_reason_${result.body.before.reason}`),
                  sizeText(result.body.after.size),
                  t(`diff_reason_${result.body.after.reason}`),
                ])}
              </p>
            ) : null}
          </div>

          {showIgnored ? (
            <section aria-label={t("diff_ignored_title")} className="diff-ignored">
              <h4>{t("diff_ignored_title")}</h4>
              <ul className="plain">
                {(ignores?.paths ?? []).map((pattern, i) => (
                  <li key={`p${i}`} className="row">
                    <span className="mono grow">{patternLabel(pattern)}</span>
                    <button
                      type="button"
                      onClick={() =>
                        ignores &&
                        saveIgnores({ ...ignores, paths: ignores.paths.filter((_, j) => j !== i) })
                      }
                    >
                      {t("diff_unignore")}
                    </button>
                  </li>
                ))}
                {(ignores?.headers ?? []).map((name, i) => (
                  <li key={`n${i}`} className="row">
                    <span className="mono grow">{name}</span>
                    <button
                      type="button"
                      onClick={() =>
                        ignores &&
                        saveIgnores({
                          ...ignores,
                          headers: ignores.headers.filter((_, j) => j !== i),
                        })
                      }
                    >
                      {t("diff_unignore")}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

const sizeText = (size: number | null) => (size === null ? "—" : formatBytes(size));

/** Cambio de la lista: prefijo e icono además del color, texto accesible equivalente (FR-031). */
function ChangeItem({
  kind,
  label,
  children,
  action,
}: {
  kind: "added" | "removed" | "changed";
  label: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className={`diff-change diff-${kind}`} data-change tabIndex={-1}>
      <span aria-hidden="true" className="diff-symbol">
        {SYMBOL[kind]}
      </span>
      <span className="visually-hidden">{t(`diff_kind_${kind}`)}: </span>
      <span className="mono diff-path">{label}</span> {children}
      {action}
    </div>
  );
}

function Values({
  change,
  real,
}: {
  change: { before?: unknown; after?: unknown; kind: string };
  real?: { before?: unknown; after?: unknown } | undefined;
}) {
  const before = real && "before" in real ? real.before : change.before;
  const after = real && "after" in real ? real.after : change.after;
  return (
    <span className="mono diff-values">
      {change.kind !== "added" ? <del>{show(before)}</del> : null}
      {change.kind === "changed" ? " → " : null}
      {change.kind !== "removed" ? <ins>{show(after)}</ins> : null}
    </span>
  );
}

function HeaderItem({
  change,
  real,
  onIgnore,
}: {
  change: HeaderChange;
  real: { before?: string; after?: string } | undefined;
  onIgnore(): void;
}) {
  return (
    <ChangeItem
      kind={change.kind}
      label={t("diff_header", change.name)}
      action={
        <button type="button" className="link" onClick={onIgnore}>
          {t("diff_ignore_header")}
        </button>
      }
    >
      <Values change={change} real={real} />
      {change.sensitive && !real ? <span className="tag">{t("diff_sensitive")}</span> : null}
    </ChangeItem>
  );
}

function JsonItem({
  change,
  real,
  onIgnore,
}: {
  change: JsonChange;
  real: { before?: unknown; after?: unknown } | undefined;
  onIgnore(pattern: PathPattern): void;
}) {
  const any = anyElement(change.path);
  return (
    <ChangeItem
      kind={change.kind}
      label={formatPath(change.path)}
      action={
        <>
          <button type="button" className="link" onClick={() => onIgnore(change.path)}>
            {t("diff_ignore_path")}
          </button>
          {any ? (
            <button type="button" className="link" onClick={() => onIgnore(any)}>
              {t("diff_ignore_any")}
            </button>
          ) : null}
        </>
      }
    >
      <Values change={change} real={real} />
      {change.sensitive && !real ? <span className="tag">{t("diff_sensitive")}</span> : null}
    </ChangeItem>
  );
}
