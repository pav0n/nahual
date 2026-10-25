import { useEffect, useState } from "react";
import { t } from "../../shared/i18n.ts";
import { originAccess } from "../repeater/permissions.ts";

/**
 * Orígenes con acceso concedido para el contexto limpio del repeater (005, FR-011a): el dev ve a
 * cuáles dio acceso y puede quitarlo.
 */
export function OriginAccess() {
  const [origins, setOrigins] = useState<string[] | null>(null);
  const refresh = () => void originAccess.list().then(setOrigins, () => setOrigins([]));
  useEffect(refresh, []);
  return (
    <section aria-labelledby="origin-access-title">
      <h3 id="origin-access-title">{t("settings_origin_access")}</h3>
      <p className="muted">{t("settings_origin_access_hint")}</p>
      {origins === null ? null : origins.length === 0 ? (
        <p className="muted">{t("settings_origin_access_empty")}</p>
      ) : (
        <ul className="plain">
          {origins.map((origin) => (
            <li key={origin} className="row">
              <span className="mono grow">{origin}</span>
              <button
                type="button"
                aria-label={t("settings_origin_access_remove", origin)}
                onClick={() => void originAccess.remove(origin).finally(refresh)}
              >
                {t("action_remove")}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
