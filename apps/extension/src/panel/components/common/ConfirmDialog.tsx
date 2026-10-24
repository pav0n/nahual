import { useId } from "react";
import { t } from "../../../shared/i18n.ts";
import { Dialog } from "./Dialog.tsx";

interface Props {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm(): void;
  onCancel(): void;
}

/** Confirmación modal sobre el `Dialog` común: atrapa el foco y `Escape` cancela (research R15). */
export function ConfirmDialog({ open, title, body, confirmLabel, onConfirm, onCancel }: Props) {
  const bodyId = useId();
  return (
    <Dialog open={open} title={title} onClose={onCancel} describedBy={bodyId} closeButton={false}>
      <p id={bodyId}>{body}</p>
      <div className="row">
        <button type="button" className="primary" onClick={onConfirm}>
          {confirmLabel}
        </button>
        <button type="button" onClick={onCancel} autoFocus>
          {t("action_cancel")}
        </button>
      </div>
    </Dialog>
  );
}
