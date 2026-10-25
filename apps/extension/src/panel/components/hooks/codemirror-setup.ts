import { autocompletion, closeBrackets, completionKeymap } from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { javascript } from "@codemirror/lang-javascript";
import {
  HighlightStyle,
  bracketMatching,
  indentOnInput,
  syntaxHighlighting,
} from "@codemirror/language";
import { linter, lintGutter, lintKeymap, type Diagnostic } from "@codemirror/lint";
import { EditorState, type Extension } from "@codemirror/state";
import {
  EditorView,
  drawSelection,
  highlightActiveLine,
  highlightActiveLineGutter,
  hoverTooltip,
  keymap,
  lineNumbers,
} from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { t } from "../../../shared/i18n.ts";
import type { TypesCheck, TypesClient } from "../../hooks/types-client.ts";

/**
 * Editor de un hook con el aspecto del editor de Sources de DevTools (006, research R13,
 * contracts/panel-ui.md): fuente y tamaño de Sources, números de línea, línea activa, colores de
 * sintaxis de DevTools y errores con subrayado y marca en el margen. Tab inserta una tabulación;
 * Esc y luego Tab sale del editor (FR-018).
 */
const highlight = HighlightStyle.define([
  {
    tag: [tags.keyword, tags.controlKeyword, tags.operatorKeyword, tags.moduleKeyword],
    color: "var(--nh-syntax-keyword)",
  },
  { tag: [tags.string, tags.special(tags.string), tags.regexp], color: "var(--nh-syntax-string)" },
  { tag: [tags.number, tags.bool, tags.null], color: "var(--nh-syntax-number)" },
  { tag: [tags.comment, tags.lineComment, tags.blockComment], color: "var(--nh-syntax-comment)" },
  { tag: [tags.propertyName], color: "var(--nh-syntax-property)" },
  { tag: [tags.typeName, tags.className], color: "var(--nh-syntax-type)" },
  {
    tag: [tags.definition(tags.variableName), tags.function(tags.definition(tags.variableName))],
    color: "var(--nh-syntax-definition)",
  },
  { tag: [tags.atom, tags.self], color: "var(--nh-syntax-atom)" },
  { tag: [tags.punctuation, tags.bracket], color: "var(--nh-syntax-subtle)" },
]);

const theme = EditorView.theme({
  "&": {
    fontFamily: "var(--nh-source-font)",
    fontSize: "var(--nh-source-size)",
    color: "var(--nh-text)",
    backgroundColor: "var(--nh-bg)",
    border: "1px solid var(--nh-divider)",
    minHeight: "180px",
  },
  "&.cm-focused": { outline: "2px solid var(--nh-focus)", outlineOffset: "-1px" },
  ".cm-scroller": { fontFamily: "inherit", lineHeight: "1.5" },
  ".cm-content": { caretColor: "var(--nh-text)" },
  ".cm-gutters": {
    backgroundColor: "var(--nh-bg)",
    color: "var(--nh-editor-gutter)",
    borderRight: "1px solid var(--nh-divider)",
  },
  ".cm-activeLine, .cm-activeLineGutter": { backgroundColor: "var(--nh-editor-active-line)" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
    backgroundColor: "var(--nh-selected)",
  },
  ".cm-tooltip": {
    backgroundColor: "var(--nh-bg)",
    color: "var(--nh-text)",
    border: "1px solid var(--nh-divider)",
    boxShadow: "var(--nh-shadow)",
    fontFamily: "var(--nh-source-font)",
    fontSize: "var(--nh-source-size)",
  },
  // `clip` recorta igual que `hidden` sin crear una región con scroll (axe: las opciones no son
  // enfocables; el foco se queda en el editor con aria-activedescendant).
  ".cm-tooltip.cm-tooltip-autocomplete > ul > li": { overflow: "clip" },
  // Se muestran pocas opciones a la vez (CodeMirror desplaza la ventana con la selección): la
  // lista no necesita scroll propio, que axe marcaría por no ser enfocable.
  ".cm-tooltip.cm-tooltip-autocomplete > ul": { maxHeight: "none", overflow: "clip" },
  ".cm-tooltip-autocomplete > ul > li[aria-selected]": {
    backgroundColor: "var(--nh-selected)",
    color: "var(--nh-selected-text)",
  },
  ".cm-completionInfo": { maxWidth: "320px", whiteSpace: "pre-wrap" },
  ".cm-hook-info": { padding: "4px 6px", whiteSpace: "pre-wrap", maxWidth: "360px" },
  ".cm-lintRange-error": {
    backgroundImage: "none",
    textDecoration: "underline wavy var(--nh-error)",
    textUnderlineOffset: "3px",
  },
  ".cm-lintRange-warning": {
    backgroundImage: "none",
    textDecoration: "underline wavy var(--nh-warn)",
    textUnderlineOffset: "3px",
  },
});

const KIND: Record<string, string> = {
  property: "property",
  method: "method",
  function: "function",
  var: "variable",
  let: "variable",
  const: "constant",
  class: "class",
  interface: "interface",
  type: "type",
  keyword: "keyword",
};

/** Mensajes propios (`hook_error_*`) traducidos; los de TypeScript van tal cual. */
const messageOf = (message: string) => (message.startsWith("hook_error_") ? t(message) : message);

export function hookEditorExtensions(
  types: TypesClient,
  onCheck: (result: TypesCheck) => void,
  onSave: () => void,
): Extension[] {
  return [
    lineNumbers(),
    highlightActiveLineGutter(),
    highlightActiveLine(),
    drawSelection(),
    history(),
    indentOnInput(),
    bracketMatching(),
    closeBrackets(),
    EditorState.tabSize.of(2),
    javascript({ typescript: true }),
    syntaxHighlighting(highlight),
    theme,
    lintGutter(),
    linter(
      async (view): Promise<Diagnostic[]> => {
        const result = await types.check(view.state.doc.toString());
        onCheck(result);
        const length = view.state.doc.length;
        return result.diagnostics.map((d) => ({
          from: Math.min(d.from, length),
          to: Math.min(Math.max(d.to, d.from + 1), length),
          severity: d.severity,
          message: messageOf(d.message),
        }));
      },
      { delay: 300 },
    ),
    autocompletion({
      maxRenderedOptions: 10,
      override: [
        async (context) => {
          const word = context.matchBefore(/[\w$]*/);
          const afterDot = /\.\s*$/.test(
            context.state.sliceDoc(Math.max(0, context.pos - 2), context.pos),
          );
          if (!context.explicit && !afterDot && (!word || word.from === word.to)) return null;
          const items = await types.complete(context.state.doc.toString(), context.pos);
          return {
            from: word?.from ?? context.pos,
            options: items.map((item) => ({
              label: item.label,
              type: KIND[item.kind] ?? "text",
              ...(item.detail ? { info: item.detail } : {}),
            })),
          };
        },
      ],
    }),
    hoverTooltip(async (view, pos) => {
      const text = await types.info(view.state.doc.toString(), pos);
      if (!text) return null;
      return {
        pos,
        create: () => {
          const dom = document.createElement("div");
          dom.className = "cm-hook-info";
          dom.textContent = text;
          return { dom };
        },
      };
    }),
    keymap.of([
      { key: "Mod-s", preventDefault: true, run: () => (onSave(), true) },
      indentWithTab,
      ...completionKeymap,
      ...lintKeymap,
      ...historyKeymap,
      ...defaultKeymap,
    ]),
    EditorView.contentAttributes.of({ "aria-label": t("hook_editor_label") }),
  ];
}
