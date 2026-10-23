import { MASK, isSensitiveHeader, type Header } from "@nahual/domain";
import { useState } from "react";
import { t } from "../../../shared/i18n.ts";

/**
 * Headers como texto. Los sensibles se enmascaran por defecto y cada uno tiene "Mostrar" hasta
 * cerrar el detalle (FR-004a); copiar un valor enmascarado copia la máscara.
 */
export function HeaderList({ headers, emptyKey }: { headers: Header[]; emptyKey: string }) {
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  if (headers.length === 0) return <p className="muted">{t(emptyKey)}</p>;
  return (
    <dl className="headers">
      {headers.map((header, index) => {
        const sensitive = isSensitiveHeader(header.name);
        const shown = !sensitive || revealed.has(index);
        return (
          <div key={`${header.name}-${index}`} className="header-item">
            <dt className="mono">{header.name}</dt>
            <dd className="mono">
              <span data-masked={!shown}>{shown ? header.value : MASK}</span>
              {sensitive ? (
                <button
                  type="button"
                  className="link"
                  aria-pressed={shown}
                  aria-label={t(shown ? "action_hide_value" : "action_show_value", header.name)}
                  onClick={() =>
                    setRevealed((current) => {
                      const next = new Set(current);
                      if (next.has(index)) next.delete(index);
                      else next.add(index);
                      return next;
                    })
                  }
                >
                  {t(shown ? "action_hide" : "action_show")}
                </button>
              ) : null}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
