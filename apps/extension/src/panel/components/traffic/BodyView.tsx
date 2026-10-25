import type { BodyInfo } from "@nahual/domain";
import { useEffect, useMemo, useState } from "react";
import { t } from "../../../shared/i18n.ts";
import { formatBytes, prettyBody } from "../../format.ts";
import { sw } from "../../sw-client.ts";

type Loaded =
  | { kind: "loading" }
  | { kind: "text"; content: string; size: number }
  | { kind: "error"; messageKey: string };

/**
 * Body de un intercambio, pedido bajo demanda (research R1). Siempre como texto en `<pre>`
 * (FR-032); JSON formateado; binarios y > 5 MB solo con metadatos y el motivo (FR-004).
 */
export function BodyView({
  exchangeId,
  side,
  info,
}: {
  exchangeId: string;
  side: "request" | "response";
  info: BodyInfo;
}) {
  const [loaded, setLoaded] = useState<Loaded>({ kind: "loading" });

  useEffect(() => {
    if (!info.available) return;
    let cancelled = false;
    const load = async () => {
      const reply = await sw.send("getBody", { exchangeId, side });
      if (cancelled) return;
      const body = reply.ok ? reply.events.find((e) => e.type === "body") : undefined;
      if (body?.type === "body") {
        setLoaded({ kind: "text", content: body.payload.content, size: body.payload.size });
      } else {
        setLoaded({ kind: "error", messageKey: "body_unavailable_evicted" });
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [exchangeId, side, info.available]);

  const pretty = useMemo(
    () => (loaded.kind === "text" ? prettyBody(loaded.content) : null),
    [loaded],
  );

  if (!info.available) {
    return (
      <p className="muted" data-body-state={info.reason ?? "none"}>
        {t(`body_unavailable_${info.reason ?? "none"}`)}
        {info.size !== null ? ` · ${formatBytes(info.size)}` : ""}
      </p>
    );
  }
  if (loaded.kind === "loading")
    return (
      <p className="muted" aria-busy="true">
        {t("body_loading")}
      </p>
    );
  if (loaded.kind === "error") return <p className="muted">{t(loaded.messageKey)}</p>;
  return <BodyText side={side} content={loaded.content} size={loaded.size} pretty={pretty} />;
}

/**
 * Body ya cargado como texto, formateado si es JSON (002 FR-004); el repeater (005) lo usa para
 * sus respuestas. Siempre como texto: nunca se interpreta como HTML (FR-032).
 */
export function BodyText({
  side,
  content,
  size,
  pretty: given,
}: {
  side: "request" | "response";
  content: string;
  size: number;
  pretty?: ReturnType<typeof prettyBody> | null;
}) {
  const pretty = useMemo(() => given ?? prettyBody(content), [given, content]);
  if (content === "") return <p className="muted">{t("body_empty")}</p>;
  return (
    <div>
      <p className="muted">
        {formatBytes(size)}
        {pretty.json ? ` · ${t("body_json")}` : ""}
      </p>
      <pre className="body mono" tabIndex={0} aria-label={t(`body_label_${side}`)}>
        {pretty.text}
      </pre>
    </div>
  );
}
