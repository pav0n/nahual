import { useEffect, useId, useRef, type ReactNode, type RefObject } from "react";
import { t } from "../../../shared/i18n.ts";
import { usePanelStore } from "../../store/index.ts";
import { IconButton } from "./IconButton.tsx";
import { ToastRegion } from "./Toast.tsx";

interface Props {
  open: boolean;
  title: ReactNode;
  onClose(): void;
  children: ReactNode;
  className?: string;
  /** Id del texto que describe el diálogo (`aria-describedby`). */
  describedBy?: string;
  /** Botón de cerrar en la cabecera (Ajustes, Ayuda). Los diálogos con su propio "Cerrar" no lo usan. */
  closeButton?: boolean;
  /** Foco inicial en el título (diálogos de lectura) o el del navegador (primer control). */
  focusTitle?: boolean;
  /** Para enfocar el título desde fuera (pasos del onboarding). */
  titleRef?: RefObject<HTMLHeadingElement | null>;
}

/**
 * Diálogo modal común (004, contracts/panel-shell.md): `<dialog>` nativo que atrapa el foco,
 * título por `aria-labelledby`, Escape cierra y el foco vuelve al disparador.
 *
 * Escape no debe llegar a DevTools: dentro de un panel de extensión también abriría el cajón de la
 * consola (research D2). Se detiene su propagación en el propio diálogo, antes de `document`.
 */
export function Dialog({
  open,
  title,
  onClose,
  children,
  className = "",
  describedBy,
  closeButton = true,
  focusTitle = false,
  titleRef: externalTitleRef,
}: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const ownTitleRef = useRef<HTMLHeadingElement>(null);
  const titleRef = externalTitleRef ?? ownTitleRef;
  const opener = useRef<Element | null>(null);
  const titleId = useId();
  const dialogId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const store = usePanelStore.getState();
    if (open && !dialog.open) {
      opener.current = document.activeElement;
      dialog.showModal();
      store.dialogOpened(dialogId);
      if (focusTitle) titleRef.current?.focus();
    }
    if (!open && dialog.open) {
      dialog.close();
      store.dialogClosed(dialogId);
      if (opener.current instanceof HTMLElement && opener.current.isConnected)
        opener.current.focus();
    }
  }, [open, focusTitle, titleRef, dialogId]);

  useEffect(() => () => usePanelStore.getState().dialogClosed(dialogId), [dialogId]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const stopEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") event.stopPropagation();
    };
    dialog.addEventListener("keydown", stopEscape);
    return () => dialog.removeEventListener("keydown", stopEscape);
  }, []);

  return (
    <dialog
      ref={ref}
      className={`dialog ${className}`}
      aria-labelledby={titleId}
      aria-describedby={describedBy}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="dialog-header">
        <h2 id={titleId} ref={titleRef} tabIndex={-1} className="grow">
          {title}
        </h2>
        {closeButton ? (
          <IconButton icon="close" label={t("action_close")} onClick={onClose} />
        ) : null}
      </div>
      {open ? children : null}
      {open ? <ToastRegion dialogId={dialogId} /> : null}
    </dialog>
  );
}
