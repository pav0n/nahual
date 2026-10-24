import { useState, type ComponentType, type KeyboardEvent, type PointerEvent } from "react";
import { t } from "../../shared/i18n.ts";
import { Icon } from "../components/common/icons.tsx";
import { uiPrefs } from "../ui-prefs.ts";

/** Contenido del cajón: hoy ninguno; 006 pone la consola de hooks (contracts/panel-shell.md). */
export const DRAWER_SLOT: { label: string; content: ComponentType | null } = {
  label: "",
  content: null,
};

const MIN = 120;
const MAX = 600;
const STEP = 16;
const clamp = (value: number) => Math.round(Math.min(MAX, Math.max(MIN, value)));

/**
 * Cajón inferior (004, FR-026): región con nombre, plegable, que comparte el alto con el área
 * principal y recuerda su alto en `UiPrefs.drawerHeight` ("entero 120–600"). Sin contenido no se
 * monta.
 */
export function Drawer() {
  const [height, setHeight] = useState(() => uiPrefs().get().drawerHeight);
  const [expanded, setExpanded] = useState(true);
  const [dragging, setDragging] = useState(false);
  const Content = DRAWER_SLOT.content;
  if (!Content) return null;

  const save = (value: number) => {
    const next = clamp(value);
    setHeight(next);
    uiPrefs().update({ drawerHeight: next });
  };

  const onKeyDown = (event: KeyboardEvent) => {
    const delta = { ArrowUp: STEP, ArrowDown: -STEP }[event.key];
    const target =
      delta !== undefined
        ? height + delta
        : event.key === "Home"
          ? MIN
          : event.key === "End"
            ? MAX
            : null;
    if (target === null) return;
    event.preventDefault();
    save(target);
  };

  const onPointerMove = (event: PointerEvent) => {
    if (dragging) save(window.innerHeight - event.clientY);
  };

  return (
    <section
      className="drawer"
      role="region"
      aria-label={DRAWER_SLOT.label}
      style={expanded ? { height } : undefined}
    >
      {expanded ? (
        <div
          role="separator"
          tabIndex={0}
          aria-orientation="horizontal"
          aria-label={t("drawer_divider")}
          aria-valuenow={height}
          aria-valuemin={MIN}
          aria-valuemax={MAX}
          className="drawer-handle"
          onKeyDown={onKeyDown}
          onPointerDown={(event) => {
            setDragging(true);
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={onPointerMove}
          onPointerUp={(event) => {
            setDragging(false);
            event.currentTarget.releasePointerCapture(event.pointerId);
          }}
        />
      ) : null}
      <div className="drawer-header">
        <span className="grow">{DRAWER_SLOT.label}</span>
        <button
          type="button"
          className="icon-button"
          aria-expanded={expanded}
          aria-label={t(expanded ? "drawer_collapse" : "drawer_expand")}
          onClick={() => setExpanded(!expanded)}
        >
          <Icon name="chevron" />
        </button>
      </div>
      {expanded ? (
        <div className="drawer-body">
          <Content />
        </div>
      ) : null}
    </section>
  );
}
