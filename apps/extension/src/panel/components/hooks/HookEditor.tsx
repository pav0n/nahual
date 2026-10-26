import { LIMITS, utf8Bytes, type HookAction } from "@nahual/domain";
import {
  HOOK_TEMPLATES,
  serializeHookFile,
  templateSource,
  type HookTemplateId,
} from "@nahual/hook-runtime";
import hookContextTypes from "../../../../../../packages/hook-runtime/src/hook-context.d.ts?raw";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { useEffect, useId, useRef, useState } from "react";
import { t } from "../../../shared/i18n.ts";
import { formatBytes } from "../../format.ts";
import type { HookDiagnostic } from "../../hooks/hook-types-service.ts";
import { createTypesClient, type TypesClient } from "../../hooks/types-client.ts";
import { shortcutLabel, shortcutById } from "../../shortcuts.ts";
import { usePanelStore } from "../../store/index.ts";
import { IconButton } from "../common/IconButton.tsx";
import { Icon } from "../common/icons.tsx";
import { Menu, anchorOf } from "../common/Menu.tsx";
import type { Anchor } from "../common/menu-logic.ts";
import { Toolbar } from "../common/Toolbar.tsx";
import type { RuleEditorSlotProps } from "../rules/editor-slots.ts";
import { toRulePayload } from "../rules/rule-form.ts";
import { hookEditorExtensions } from "./codemirror-setup.ts";

const lang = (): "es" | "en" => (chrome.i18n.getUILanguage().startsWith("es") ? "es" : "en");

/**
 * Editor de un hook (006, FR-015 a FR-019, contracts/panel-ui.md): barra como la de Sources con
 * las plantillas y el uso, el editor de código, la ayuda de teclado, los problemas y los permisos
 * de la regla. Se carga solo al elegir la acción "Modificar con hook".
 */
export default function HookEditor({ form, setForm, issues, onSave }: RuleEditorSlotProps) {
  const action = form.action as HookAction;
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const types = useRef<TypesClient | null>(null);
  const latest = useRef({ form, setForm, onSave });
  useEffect(() => {
    latest.current = { form, setForm, onSave };
  });
  const [diagnostics, setDiagnostics] = useState<HookDiagnostic[] | null>(null);
  const [templatesAnchor, setTemplatesAnchor] = useState<Anchor | null>(null);
  const templatesButton = useRef<HTMLButtonElement>(null);
  const helpId = useId();
  const rules = usePanelStore((s) => s.rules);

  const setAction = (patch: Partial<HookAction>) => {
    const { form: current, setForm: set } = latest.current;
    set({ ...current, action: { ...(current.action as HookAction), ...patch } });
  };

  useEffect(() => {
    if (!host.current) return;
    const client = createTypesClient();
    types.current = client;
    const editor = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: action.source,
        extensions: [
          hookEditorExtensions(
            client,
            (result) => {
              setDiagnostics(result.diagnostics);
              // Solo si el análisis es del código actual (el dev pudo seguir escribiendo).
              const current = latest.current.form.action as HookAction;
              if (current.source === editor.state.doc.toString())
                setAction({ check: result.check });
            },
            () => latest.current.onSave(),
          ),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) setAction({ source: update.state.doc.toString() });
          }),
          EditorView.contentAttributes.of({ "aria-describedby": helpId }),
        ],
      }),
    });
    view.current = editor;
    return () => {
      editor.destroy();
      client.dispose();
      view.current = null;
    };
    // El editor se crea una vez; los cambios de código salen de él.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyTemplate = (id: HookTemplateId) => {
    const template = HOOK_TEMPLATES.find((x) => x.id === id);
    const editor = view.current;
    if (!template || !editor) return;
    const source = templateSource(id, lang());
    editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: source } });
    const { form: current, setForm: set } = latest.current;
    // Como las plantillas de 002: exige un prefiltro antes de guardar (FR-017).
    set({
      ...current,
      stage: template.stage,
      prefilterPattern: current.prefilterPattern === "*" ? "" : current.prefilterPattern,
      action: { ...(current.action as HookAction), source },
    });
    editor.focus();
  };

  /** Descarga sin red: un `Blob` y un enlace `download` (FR-035, FR-039). */
  const download = (name: string, text: string) => {
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1_000);
  };
  const exportHook = () => {
    const { form: current } = latest.current;
    const config = {
      name: current.name.trim() || "hook",
      stage: current.stage,
      prefilter: { kind: current.prefilterKind, pattern: current.prefilterPattern || "*" },
      methods: current.methods,
      resourceTypes: current.resourceTypes,
      conditions: toRulePayload(current).conditions as never,
    };
    const fileName = `${config.name.replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "") || "hook"}.ts`;
    download(fileName, serializeHookFile(config, (current.action as HookAction).source));
  };
  const downloadTypes = () => download("nahual-hooks.d.ts", hookContextTypes);

  const others = rules.filter((r) => r.id !== form.id && r.action.kind === "hook");
  const used =
    others.reduce(
      (sum, r) => sum + (r.action.kind === "hook" ? utf8Bytes(r.action.source) : 0),
      0,
    ) + utf8Bytes(action.source);
  const errors = (diagnostics ?? []).filter((d) => d.severity === "error");
  const blocked = !action.check.ok;
  const sizeIssue = issues.find((i) => i.path === "action.source");

  return (
    <section className="hook-editor" aria-label={t("hook_editor_title")}>
      <Toolbar label={t("hook_editor_toolbar")} className="hook-toolbar">
        <button
          ref={templatesButton}
          type="button"
          className="toolbar-menu-button"
          aria-haspopup="menu"
          aria-expanded={templatesAnchor !== null}
          onClick={() => {
            if (templatesButton.current) setTemplatesAnchor(anchorOf(templatesButton.current));
          }}
        >
          {t("hook_templates")}
          <Icon name="chevron" />
        </button>
        <span className="toolbar-separator" />
        <IconButton icon="export" label={t("hook_export")} onClick={exportHook} />
        <IconButton icon="download" label={t("hook_download_types")} onClick={downloadTypes} />
        <span className="toolbar-spacer" />
        <span className="muted hook-usage">
          {t("hook_usage", [formatBytes(used), formatBytes(LIMITS.hookTotalBytesMax)])}
        </span>
      </Toolbar>
      <Menu
        open={templatesAnchor !== null}
        anchor={templatesAnchor}
        label={t("hook_templates")}
        items={HOOK_TEMPLATES.map((template) => ({
          id: template.id,
          label: t(`hook_template_${template.id}`),
          onSelect: () => applyTemplate(template.id),
        }))}
        onClose={() => setTemplatesAnchor(null)}
        returnFocus={templatesButton}
      />
      <div
        ref={host}
        className="hook-code"
        onKeyDown={(event) => {
          // Esc es la mitad de "Esc y luego Tab" para salir del editor: no cierra la regla.
          if (event.key === "Escape") event.stopPropagation();
        }}
      />
      <p id={helpId} className="muted hook-help">
        {t("hook_editor_help", shortcutLabel(shortcutById("saveRule")))}
      </p>
      <div className="hook-problems" role="status" aria-live="polite">
        {diagnostics === null ? (
          <span className="muted">{t("hook_checking")}</span>
        ) : errors.length === 0 ? (
          <span className="muted">{t("hook_no_problems")}</span>
        ) : (
          <>
            <span>{t("hook_problems_count", String(errors.length))}</span>
            <ul className="plain">
              {errors.slice(0, 20).map((d, i) => (
                <li key={i} className="mono">
                  {t("hook_problem_line", [
                    String(d.line),
                    d.message.startsWith("hook_error_") ? t(d.message) : d.message,
                  ])}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
      {sizeIssue ? (
        <p role="alert" className="field-error">
          {t(sizeIssue.messageKey, [formatBytes(used), formatBytes(LIMITS.hookTotalBytesMax)])}
        </p>
      ) : null}
      {blocked ? <p className="field-warning">{t("hook_saved_disabled")}</p> : null}
      <fieldset className="hook-permissions">
        <legend>{t("hook_permissions")}</legend>
        <label className="check check-multiline">
          <input
            type="checkbox"
            checked={action.permissions.changeDestination}
            onChange={(e) =>
              setAction({
                permissions: { ...action.permissions, changeDestination: e.target.checked },
              })
            }
          />
          <span>
            {t("hook_permission_destination")}
            <span className="muted check-hint">{t("hook_permission_destination_hint")}</span>
          </span>
        </label>
        <label className="check check-multiline">
          <input
            type="checkbox"
            checked={action.permissions.readSensitive}
            onChange={(e) =>
              setAction({
                permissions: { ...action.permissions, readSensitive: e.target.checked },
              })
            }
          />
          <span>
            {t("hook_permission_sensitive")}
            <span className="muted check-hint">{t("hook_permission_sensitive_hint")}</span>
          </span>
        </label>
      </fieldset>
    </section>
  );
}
