import type { CapturedExchange, PausedItemView } from "@nahual/domain";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { t } from "../../../shared/i18n.ts";
import { formatBytes, formatDuration, formatStatus } from "../../format.ts";
import { IconButton } from "../common/IconButton.tsx";
import { TabPanel, Tabs } from "../common/Tabs.tsx";
import { HooksTab } from "../hooks/HooksTab.tsx";
import { PausedEditor } from "../queue/PausedEditor.tsx";
import { usePanelStore } from "../../store/index.ts";
import { BodyView } from "./BodyView.tsx";
import { CorsSection } from "./CorsSection.tsx";
import { DETAIL_TABS, detailTabsFor, initialDetailTab, type DetailTabId } from "./detail-tabs.ts";
import { HeaderList } from "./HeaderList.tsx";

const PREFIX = "detail";

/**
 * Detalle de un intercambio (002 FR-004; 004 FR-018): cabecera con el request y sus acciones,
 * resumen y pestañas según el caso: CORS primero si fue bloqueado, Editar (el editor de pausa de
 * 002) si está pausado y Headers en otro caso. Si el pausado vence o se resuelve con el detalle
 * abierto, la pestaña Editar desaparece y queda Headers (research R10).
 */
export function ExchangeDetail({
  exchange,
  paused = null,
  relatedId = null,
  onOpen,
  onClose,
  actions,
  initialTab = null,
}: {
  exchange: CapturedExchange;
  /** Pausado activo de este intercambio, si lo hay (FR-016). */
  paused?: PausedItemView | null;
  /** Preflight de un request o request de un preflight (FR-006). */
  relatedId?: string | null;
  onOpen?(id: string): void;
  onClose(): void;
  /** Acciones del request (004 US3), en la cabecera. */
  actions?: ReactNode;
  /** Pestaña pedida al abrir (p. ej. CORS al llegar desde el preflight relacionado). */
  initialTab?: DetailTabId | null;
}) {
  const [tab, setTab] = useState<DetailTabId>(
    () => initialTab ?? initialDetailTab(exchange, paused),
  );
  const headingRef = useRef<HTMLHeadingElement>(null);
  const hasHooks = usePanelStore((s) => (s.hookExecutions[exchange.id]?.length ?? 0) > 0);
  const tabs = detailTabsFor(exchange, paused, relatedId !== null, hasHooks);
  const current = tabs.includes(tab) ? tab : "headers";

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <section
      className="detail"
      aria-labelledby="detail-title"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          // Tampoco llega a DevTools, que abriría el cajón de la consola (research D2).
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <div className="detail-header">
        <h2 id="detail-title" ref={headingRef} tabIndex={-1} className="mono" title={exchange.url}>
          {exchange.method} {exchange.url}
        </h2>
        {actions}
        <IconButton icon="close" label={t("action_close_detail")} onClick={onClose} />
      </div>
      <Tabs<DetailTabId>
        idPrefix={PREFIX}
        label={t("detail_tabs_label")}
        tabs={DETAIL_TABS.filter((entry) => tabs.includes(entry.id)).map((entry) => ({
          id: entry.id,
          label: t(entry.labelKey),
        }))}
        selected={current}
        onSelect={setTab}
      />
      <div className="detail-body">
        <dl className="summary">
          <div>
            <dt>{t("traffic_col_status")}</dt>
            <dd>
              {formatStatus(exchange.status, exchange.state)}
              {exchange.errorText ? ` · ${exchange.errorText}` : ""}
            </dd>
          </div>
          <div>
            <dt>{t("traffic_col_type")}</dt>
            <dd>{exchange.resourceType}</dd>
          </div>
          <div>
            <dt>{t("detail_transferred")}</dt>
            <dd>{formatBytes(exchange.encodedSize)}</dd>
          </div>
          <div>
            <dt>{t("detail_decoded")}</dt>
            <dd>{formatBytes(exchange.decodedSize)}</dd>
          </div>
          <div>
            <dt>{t("traffic_col_time")}</dt>
            <dd>{formatDuration(exchange.durationMs)}</dd>
          </div>
        </dl>
        {exchange.urlTruncated ? <p className="muted">{t("detail_url_truncated")}</p> : null}
        {exchange.ruleEffects.length > 0 ? (
          <ul className="plain effects">
            {exchange.ruleEffects.map((effect, i) => (
              <li key={i}>
                {t("traffic_rule_applied", [effect.ruleName, t(`result_${effect.result}`)])}
                {effect.reason ? ` · ${t(`unevaluable_${effect.reason}`)}` : ""}
                {effect.errorKey ? ` · ${t(effect.errorKey)}` : ""}
                {effect.destination
                  ? ` · ${t("hooks_destination", [effect.destination.from, effect.destination.to])}`
                  : ""}
              </li>
            ))}
          </ul>
        ) : null}
        {tabs.includes("cors") ? (
          <TabPanel idPrefix={PREFIX} id="cors" hidden={current !== "cors"}>
            <CorsSection exchange={exchange} relatedId={relatedId} onOpen={(id) => onOpen?.(id)} />
          </TabPanel>
        ) : null}
        {paused ? (
          <TabPanel idPrefix={PREFIX} id="edit" hidden={current !== "edit"}>
            <PausedEditor key={paused.pausedId} item={paused} inDetail />
          </TabPanel>
        ) : null}
        <TabPanel idPrefix={PREFIX} id="headers" hidden={current !== "headers"}>
          <h3>{t("detail_request_headers")}</h3>
          <HeaderList headers={exchange.requestHeaders} emptyKey="detail_no_headers" />
          <h3>{t("detail_response_headers")}</h3>
          <HeaderList headers={exchange.responseHeaders} emptyKey="detail_no_headers" />
        </TabPanel>
        <TabPanel idPrefix={PREFIX} id="request" hidden={current !== "request"}>
          <BodyView exchangeId={exchange.id} side="request" info={exchange.requestBody} />
        </TabPanel>
        <TabPanel idPrefix={PREFIX} id="response" hidden={current !== "response"}>
          <BodyView exchangeId={exchange.id} side="response" info={exchange.responseBody} />
        </TabPanel>
        {hasHooks ? (
          <TabPanel idPrefix={PREFIX} id="hooks" hidden={current !== "hooks"}>
            <HooksTab exchangeId={exchange.id} />
          </TabPanel>
        ) : null}
      </div>
    </section>
  );
}
