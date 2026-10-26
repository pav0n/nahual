import type { CapturedExchange } from "@nahual/domain";
import type { RefObject } from "react";
import { t } from "../../../shared/i18n.ts";
import {
  applicableActions,
  type ActionEffects,
  type ActionState,
} from "../../actions/request-actions.ts";
import { openRepeaterFromExchange } from "../../repeater/open-from-exchange.ts";
import { usePanelStore } from "../../store/index.ts";
import { Menu } from "../common/Menu.tsx";
import { Toolbar } from "../common/Toolbar.tsx";
import type { Anchor } from "../common/menu-logic.ts";

/** Referencia estable: un `[]` nuevo en el selector haría renderizar en bucle. */
const NO_ORIGINS: readonly string[] = [];

/** Efectos de las acciones sobre el store del panel. */
const effects: ActionEffects = {
  openRuleDraft: (draft) => usePanelStore.getState().openRuleDraft(draft),
  openDetail: (exchangeId, tab) => {
    const store = usePanelStore.getState();
    store.setSection("traffic");
    store.selectExchange(exchangeId, tab);
  },
  requestRelax: (exchangeId) => usePanelStore.getState().requestRelax(exchangeId),
  sendToRepeater: (exchange) => void openRepeaterFromExchange(exchange),
  openExport: (exchangeIds) =>
    usePanelStore.getState().openExport({ kind: "traffic", exchangeIds }),
};

/** Estado que la aplicabilidad necesita, del store. */
function useActionState(exchange: CapturedExchange): ActionState {
  const relaxations = usePanelStore((s) => s.relaxations);
  const productionOrigins = usePanelStore((s) => s.settings?.productionOrigins ?? NO_ORIGINS);
  const paused = usePanelStore((s) => s.paused.find((p) => p.exchangeId === exchange.id) ?? null);
  return { relaxations, productionOrigins, paused };
}

/** Cabecera del detalle: las acciones del catálogo que aplican, en su orden (FR-020). */
export function RequestActionsBar({ exchange }: { exchange: CapturedExchange }) {
  const actions = applicableActions(exchange, useActionState(exchange));
  return (
    <Toolbar label={t("request_actions_label")} className="detail-actions">
      {actions.map((action) => (
        <button key={action.id} type="button" onClick={() => action.run(exchange, effects)}>
          {t(action.labelKey)}
        </button>
      ))}
    </Toolbar>
  );
}

/**
 * Menú contextual de una fila (FR-021): el mismo catálogo que la cabecera. Al cerrarlo con Escape
 * el foco vuelve a la fila.
 */
export function RowMenu({
  exchange,
  anchor,
  row,
  onClose,
}: {
  exchange: CapturedExchange;
  anchor: Anchor;
  row: RefObject<HTMLElement | null>;
  onClose(): void;
}) {
  const actions = applicableActions(exchange, useActionState(exchange));
  return (
    <Menu
      open
      anchor={anchor}
      label={t("request_menu_label", `${exchange.method} ${exchange.url}`.slice(0, 120))}
      returnFocus={row}
      onClose={onClose}
      items={actions.map((action) => ({
        id: action.id,
        label: t(action.labelKey),
        onSelect: () => action.run(exchange, effects),
      }))}
    />
  );
}
