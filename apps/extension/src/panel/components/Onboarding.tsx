import { useEffect, useId, useRef, useState } from "react";
import { t } from "../../shared/i18n.ts";
import { userAttach } from "../attach-control.ts";
import { command } from "../commands.ts";
import { ShortcutsList } from "../settings/ShortcutsList.tsx";
import { usePanelStore } from "../store/index.ts";
import { Dialog } from "./common/Dialog.tsx";

const STEPS = ["bar", "data", "local"] as const;

/**
 * Primer uso (FR-027) y Ayuda (004 FR-019): tres pasos en el `Dialog` común (atrapa el foco,
 * `Escape` omite). El último ofrece "Adjuntar y empezar", que registra el consentimiento
 * (FR-027a). Desde "Ayuda" se reabre con la lista de atajos.
 */
export function Onboarding() {
  const settings = usePanelStore((s) => s.settings);
  const helpOpen = usePanelStore((s) => s.helpOpen);
  const setHelpOpen = usePanelStore((s) => s.setHelpOpen);
  const status = usePanelStore((s) => s.session?.status ?? "detached");
  const [step, setStep] = useState(0);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const bodyId = useId();
  const open = helpOpen || settings?.onboardingSeen === false;

  useEffect(() => {
    titleRef.current?.focus();
  }, [step]);

  const close = () => {
    setHelpOpen(false);
    setStep(0);
    if (settings && !settings.onboardingSeen)
      void command("updateSettings", { onboardingSeen: true });
  };

  const current = STEPS[step] ?? "bar";
  const last = step === STEPS.length - 1;

  return (
    <Dialog
      open={open}
      title={t(`onboarding_${current}_title`)}
      onClose={close}
      className="onboarding"
      describedBy={bodyId}
      closeButton={false}
      focusTitle
      titleRef={titleRef}
    >
      <p className="muted">{t("onboarding_step", [String(step + 1), String(STEPS.length)])}</p>
      <div id={bodyId}>
        <p>{t(`onboarding_${current}_body`)}</p>
        {current === "data" ? <p>{t("onboarding_data_mask")}</p> : null}
      </div>
      {helpOpen ? (
        <section aria-labelledby={`${bodyId}-shortcuts`}>
          <h3 id={`${bodyId}-shortcuts`}>{t("settings_section_shortcuts")}</h3>
          <ShortcutsList />
        </section>
      ) : null}
      <div className="row">
        {step > 0 ? (
          <button type="button" onClick={() => setStep(step - 1)}>
            {t("action_back")}
          </button>
        ) : null}
        <span className="grow" />
        <button type="button" onClick={close}>
          {t(last || helpOpen ? "action_close" : "action_skip")}
        </button>
        {last ? (
          status !== "attached" ? (
            <button
              type="button"
              className="primary"
              onClick={() => {
                close();
                void userAttach(true);
              }}
            >
              {t("action_attach_and_start")}
            </button>
          ) : null
        ) : (
          <button type="button" className="primary" onClick={() => setStep(step + 1)}>
            {t("action_next")}
          </button>
        )}
      </div>
    </Dialog>
  );
}
