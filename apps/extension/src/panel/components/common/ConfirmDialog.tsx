import { useEffect, useRef } from "react";
import { t } from "../../../shared/i18n.ts";

interface Props {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm(): void;
  onCancel(): void;
}

/** Confirmación nativa con `<dialog>` modal: atrapa el foco y `Escape` cancela (research R15). */
export function ConfirmDialog({ open, title, body, confirmLabel, onConfirm, onCancel }: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby="confirm-title"
      aria-describedby="confirm-body"
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
    >
      <h2 id="confirm-title">{title}</h2>
      <p id="confirm-body">{body}</p>
      <div className="row">
        <button type="button" className="primary" onClick={onConfirm}>
          {confirmLabel}
        </button>
        <button type="button" onClick={onCancel} autoFocus>
          {t("action_cancel")}
        </button>
      </div>
    </dialog>
  );
}
