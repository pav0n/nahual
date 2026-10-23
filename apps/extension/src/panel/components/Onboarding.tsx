import { useEffect, useRef, useState } from "react";
import { t } from "../../shared/i18n.ts";
import { userAttach } from "../attach-control.ts";
import { command } from "../commands.ts";
import { usePanelStore } from "../store/index.ts";

const STEPS = ["bar", "data", "local"] as const;

/**
 * Primer uso (FR-027): tres pasos en un `<dialog>` modal (atrapa el foco, `Escape` omite). El
 * último ofrece "Adjuntar y empezar", que registra el consentimiento (FR-027a). Se reabre desde
 * "Ayuda".
 */
export function Onboarding() {
  const settings = usePanelStore((s) => s.settings);
  const helpOpen = usePanelStore((s) => s.helpOpen);
  const setHelpOpen = usePanelStore((s) => s.setHelpOpen);
  const status = usePanelStore((s) => s.session?.status ?? "detached");
  const [step, setStep] = useState(0);
  const ref = useRef<HTMLDialogElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const open = helpOpen || settings?.onboardingSeen === false;

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      titleRef.current?.focus();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

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
    <dialog
      ref={ref}
      className="onboarding"
      aria-labelledby="onboarding-title"
      aria-describedby="onboarding-body"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      <p className="muted">{t("onboarding_step", [String(step + 1), String(STEPS.length)])}</p>
      <h2 id="onboarding-title" ref={titleRef} tabIndex={-1}>
        {t(`onboarding_${current}_title`)}
      </h2>
      <div id="onboarding-body">
        <p>{t(`onboarding_${current}_body`)}</p>
        {current === "data" ? <p>{t("onboarding_data_mask")}</p> : null}
      </div>
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
    </dialog>
  );
}
