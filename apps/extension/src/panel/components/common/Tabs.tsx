import { useRef, type KeyboardEvent, type ReactNode } from "react";

export interface TabItem<T extends string> {
  id: T;
  label: ReactNode;
}

interface Props<T extends string> {
  /** Prefijo para los ids de pestañas y paneles. */
  idPrefix: string;
  label: string;
  tabs: TabItem<T>[];
  selected: T;
  onSelect(id: T): void;
  /** Vertical: también se recorren con flechas arriba y abajo (Ajustes). */
  orientation?: "horizontal" | "vertical";
}

export const tabId = (prefix: string, id: string) => `${prefix}-tab-${id}`;
export const tabPanelId = (prefix: string, id: string) => `${prefix}-panel-${id}`;

/**
 * Pestañas según el patrón APG (activación automática): flechas, Inicio y Fin mueven el foco y
 * la selección; solo la pestaña activa está en el orden de tabulación.
 */
export function Tabs<T extends string>({
  idPrefix,
  label,
  tabs,
  selected,
  onSelect,
  orientation = "horizontal",
}: Props<T>) {
  const refs = useRef(new Map<T, HTMLButtonElement>());

  const onKeyDown = (event: KeyboardEvent) => {
    const index = tabs.findIndex((t) => t.id === selected);
    let next: number;
    const vertical = orientation === "vertical";
    if (event.key === "ArrowRight" || (vertical && event.key === "ArrowDown"))
      next = (index + 1) % tabs.length;
    else if (event.key === "ArrowLeft" || (vertical && event.key === "ArrowUp"))
      next = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = tabs.length - 1;
    else return;
    event.preventDefault();
    const target = tabs[next];
    if (!target) return;
    onSelect(target.id);
    refs.current.get(target.id)?.focus();
  };

  return (
    <div
      role="tablist"
      aria-label={label}
      aria-orientation={orientation}
      className="tabs"
      onKeyDown={onKeyDown}
    >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          ref={(el) => {
            if (el) refs.current.set(tab.id, el);
            else refs.current.delete(tab.id);
          }}
          type="button"
          role="tab"
          id={tabId(idPrefix, tab.id)}
          aria-selected={tab.id === selected}
          aria-controls={tabPanelId(idPrefix, tab.id)}
          tabIndex={tab.id === selected ? 0 : -1}
          onClick={() => onSelect(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export function TabPanel({
  idPrefix,
  id,
  hidden,
  children,
}: {
  idPrefix: string;
  id: string;
  hidden: boolean;
  children: ReactNode;
}) {
  return (
    <div
      role="tabpanel"
      id={tabPanelId(idPrefix, id)}
      aria-labelledby={tabId(idPrefix, id)}
      hidden={hidden}
      className="tabpanel"
    >
      {hidden ? null : children}
    </div>
  );
}
