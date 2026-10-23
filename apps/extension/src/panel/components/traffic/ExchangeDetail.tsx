import type { CapturedExchange } from "@nahual/domain";
import { useEffect, useRef, useState } from "react";
import { t } from "../../../shared/i18n.ts";
import { formatBytes, formatDuration, formatStatus } from "../../format.ts";
import { TabPanel, Tabs } from "../common/Tabs.tsx";
import { BodyView } from "./BodyView.tsx";
import { CorsSection } from "./CorsSection.tsx";
import { HeaderList } from "./HeaderList.tsx";

type DetailTab = "headers" | "request" | "response";
const PREFIX = "detail";

/** Detalle de un intercambio (FR-004): resumen, headers y bodies de request y response. */
export function ExchangeDetail({
  exchange,
  relatedId = null,
  onOpen,
  onClose,
}: {
  exchange: CapturedExchange;
  /** Preflight de un request o request de un preflight (FR-006). */
  relatedId?: string | null;
  onOpen?(id: string): void;
  onClose(): void;
}) {
  const [tab, setTab] = useState<DetailTab>("headers");
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <section
      className="detail"
      aria-labelledby="detail-title"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <div className="row">
        <h2 id="detail-title" ref={headingRef} tabIndex={-1} className="grow mono">
          {exchange.method} {exchange.url}
        </h2>
        <button type="button" onClick={onClose}>
          {t("action_close_detail")}
        </button>
      </div>
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
            </li>
          ))}
        </ul>
      ) : null}
      <CorsSection exchange={exchange} relatedId={relatedId} onOpen={(id) => onOpen?.(id)} />
      <Tabs<DetailTab>
        idPrefix={PREFIX}
        label={t("detail_tabs_label")}
        tabs={[
          { id: "headers", label: t("detail_tab_headers") },
          { id: "request", label: t("detail_tab_request") },
          { id: "response", label: t("detail_tab_response") },
        ]}
        selected={tab}
        onSelect={setTab}
      />
      <TabPanel idPrefix={PREFIX} id="headers" hidden={tab !== "headers"}>
        <h3>{t("detail_request_headers")}</h3>
        <HeaderList headers={exchange.requestHeaders} emptyKey="detail_no_headers" />
        <h3>{t("detail_response_headers")}</h3>
        <HeaderList headers={exchange.responseHeaders} emptyKey="detail_no_headers" />
      </TabPanel>
      <TabPanel idPrefix={PREFIX} id="request" hidden={tab !== "request"}>
        <BodyView exchangeId={exchange.id} side="request" info={exchange.requestBody} />
      </TabPanel>
      <TabPanel idPrefix={PREFIX} id="response" hidden={tab !== "response"}>
        <BodyView exchangeId={exchange.id} side="response" info={exchange.responseBody} />
      </TabPanel>
    </section>
  );
}
