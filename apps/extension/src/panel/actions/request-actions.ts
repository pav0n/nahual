import {
  matchProductionOrigin,
  ruleDraftFromExchange,
  type CapturedExchange,
  type PausedItemView,
  type RelaxationView,
  type RuleDraft,
} from "@nahual/domain";
import type { DetailTabId } from "../components/traffic/detail-tabs.ts";
import type { ShortcutId } from "../shortcuts.ts";

/** Lo que la aplicabilidad necesita del store; nunca `chrome.*` (contracts/panel-shell.md). */
export interface ActionState {
  relaxations: readonly RelaxationView[];
  productionOrigins?: readonly string[];
  paused?: PausedItemView | null;
}

/** Efectos de las acciones, por los comandos y el store del panel. */
export interface ActionEffects {
  openRuleDraft(draft: RuleDraft): void;
  openDetail(exchangeId: string, tab: DetailTabId): void;
  requestRelax(exchangeId: string): void;
  /** Abre una pestaña del repeater con el request (005, FR-002). */
  sendToRepeater(exchange: CapturedExchange): void;
}

export interface RequestAction {
  id: "createRule" | "sendToRepeater" | "relaxCors";
  labelKey: string;
  shortcut?: ShortcutId;
  appliesTo(exchange: CapturedExchange, state: ActionState): boolean;
  run(exchange: CapturedExchange, effects: ActionEffects): void;
}

/** ¿Hay una relajación activa (o suspendida) que ya cubra ese par de orígenes? */
const covered = (exchange: CapturedExchange, state: ActionState) => {
  const d = exchange.cors?.diagnosis;
  return state.relaxations.some((r) => r.appOrigin === d?.appOrigin && r.apiOrigin === d.apiOrigin);
};

/** Orígenes de producción: ahí nunca se relaja (003 FR-029). */
const inProduction = (exchange: CapturedExchange, state: ActionState) => {
  const d = exchange.cors?.diagnosis;
  const list = state.productionOrigins ?? [];
  return [d?.appOrigin, d?.apiOrigin].some(
    (origin) => origin != null && matchProductionOrigin(origin, list) !== null,
  );
};

/**
 * Catálogo único de acciones de un request (004, research R6, FR-020/022): alimenta la cabecera
 * del detalle y el menú contextual en este orden, así que siempre coinciden. 005 añade
 * `sendToRepeater` y 007 `export`.
 */
export const REQUEST_ACTIONS: readonly RequestAction[] = [
  {
    id: "createRule",
    labelKey: "action_create_rule_from_request",
    appliesTo: () => true,
    run: (exchange, effects) => effects.openRuleDraft(ruleDraftFromExchange(exchange)),
  },
  {
    id: "sendToRepeater",
    labelKey: "action_send_to_repeater",
    appliesTo: () => true,
    run: (exchange, effects) => effects.sendToRepeater(exchange),
  },
  {
    id: "relaxCors",
    labelKey: "cors_relax_action",
    appliesTo: (exchange, state) =>
      !exchange.isPreflight &&
      exchange.cors?.diagnosis?.relaxable === true &&
      !covered(exchange, state) &&
      !inProduction(exchange, state),
    // La misma confirmación en línea de 003 (FR-024): en el detalle, pestaña CORS.
    run: (exchange, effects) => {
      effects.openDetail(exchange.id, "cors");
      effects.requestRelax(exchange.id);
    },
  },
];

export const applicableActions = (exchange: CapturedExchange, state: ActionState) =>
  REQUEST_ACTIONS.filter((action) => action.appliesTo(exchange, state));
