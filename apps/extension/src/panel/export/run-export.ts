import {
  exportAs,
  type ExportFormat,
  type ExportResult,
  type ExportSource,
} from "@nahual/domain/export";
import { sw } from "../sw-client.ts";
import type { BodyLoader } from "./build-source.ts";

/** Versión de Nahual para el comentario inicial del código generado. */
const appVersion = () => globalThis.chrome?.runtime?.getManifest?.().version ?? "dev";

/** `getBody` del SW (texto, o base64 si el request no es textual), como "Enviar al repeater". */
export const loadBody: BodyLoader = async (exchangeId, side) => {
  const reply = await sw.send("getBody", {
    exchangeId,
    side,
    ...(side === "request" ? { binary: true as const } : {}),
  });
  const event = reply.ok ? reply.events.find((e) => e.type === "body") : undefined;
  return event?.type === "body" ? event.payload : null;
};

/** Genera el código en el panel, sin red ni almacenamiento (FR-018). */
export const runExport = (
  format: ExportFormat,
  sources: readonly ExportSource[],
  includeSensitive: boolean,
  site: string | null,
): ExportResult =>
  exportAs(format, sources, {
    appVersion: appVersion(),
    includeSensitive,
    ...(site ? { site } : {}),
  });
