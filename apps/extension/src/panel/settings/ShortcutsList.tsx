import { t } from "../../shared/i18n.ts";
import { SHORTCUTS, shortcutLabel } from "../shortcuts.ts";

/** Todos los atajos, desde el inventario único (004, FR-030): Ajustes ⇒ Atajos y Ayuda. */
export function ShortcutsList() {
  return (
    <dl className="shortcut-list">
      {SHORTCUTS.map((shortcut) => (
        <div key={shortcut.id} style={{ display: "contents" }}>
          <dt>
            <kbd>{shortcutLabel(shortcut)}</kbd>
          </dt>
          <dd>{t(shortcut.descriptionKey)}</dd>
        </div>
      ))}
    </dl>
  );
}
