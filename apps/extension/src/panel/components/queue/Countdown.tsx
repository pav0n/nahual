import { useEffect, useState } from "react";
import { t } from "../../../shared/i18n.ts";

/**
 * Cuenta regresiva de un item pausado (FR-022). El texto visible cambia cada segundo; a los
 * lectores de pantalla se les anuncia cada 10 s y cada segundo en los últimos 5 s, para no
 * saturarlos.
 */
export function Countdown({ expiresAt, totalMs }: { expiresAt: number; totalMs: number }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Acotado al timeout del item: un reloj adelantado nunca muestra más de lo configurado.
  const seconds = Math.max(
    0,
    Math.min(Math.ceil(totalMs / 1000), Math.ceil((expiresAt - now) / 1000)),
  );
  const announced = seconds <= 5 ? seconds : Math.ceil(seconds / 10) * 10;
  return (
    <span className="countdown" data-urgent={seconds <= 10}>
      <span aria-hidden="true">{t("paused_expires_in", String(seconds))}</span>
      <span className="visually-hidden" aria-live="polite">
        {t("paused_expires_in", String(announced))}
      </span>
    </span>
  );
}
