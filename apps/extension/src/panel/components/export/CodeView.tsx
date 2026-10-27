import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { useEffect, useRef } from "react";
import { readOnlyExtensions } from "../hooks/codemirror-setup.ts";

interface Props {
  code: string;
  language: "typescript" | "json" | "text";
  label: string;
}

/**
 * Código de solo lectura con el editor de 006 (FR-003). Va en el chunk de CodeMirror: el panel no
 * lo carga hasta abrir una vista previa (SC-007 de 006, T069).
 */
export default function CodeView({ code, language, label }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);

  useEffect(() => {
    if (!host.current) return;
    const editor = new EditorView({
      parent: host.current,
      state: EditorState.create({ doc: code, extensions: readOnlyExtensions(language, label) }),
    });
    view.current = editor;
    return () => {
      editor.destroy();
      view.current = null;
    };
    // El documento se cambia abajo; recrear el editor solo si cambian lenguaje o nombre.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language, label]);

  useEffect(() => {
    const editor = view.current;
    if (!editor || editor.state.doc.toString() === code) return;
    editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: code } });
  }, [code]);

  return <div ref={host} className="export-code" />;
}
