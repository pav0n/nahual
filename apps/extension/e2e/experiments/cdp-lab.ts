import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Worker } from "@playwright/test";

const out = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../test-results/experiments",
);

/** Guarda el resultado de un experimento para copiarlo a research.md. */
export function saveResult(name: string, data: unknown) {
  mkdirSync(out, { recursive: true });
  writeFileSync(path.join(out, `${name}.json`), JSON.stringify(data, null, 2));
  console.log(`[${name}]`, JSON.stringify(data, null, 2));
}

/**
 * Laboratorio CDP dentro del service worker de Nahual: adjunta, registra eventos y aplica una
 * política de respuesta a cada `Fetch.requestPaused`. Solo para experimentos.
 */
export async function installLab(worker: Worker, tabId: number) {
  await worker.evaluate(async (id) => {
    type LabPolicy =
      | { name: "continue" }
      | { name: "addCors"; origin: string; credentials: boolean }
      | { name: "fulfillPreflight"; origin: string; credentials: boolean };
    type Action = { cmd: string; params?: Record<string, unknown> };
    // Estrategias con nombre: el SW no puede evaluar código (CSP de MV3).
    const corsHeaders = (origin: string, credentials: boolean) => [
      { name: "Access-Control-Allow-Origin", value: origin },
      { name: "Access-Control-Allow-Methods", value: "GET, POST, PUT, DELETE" },
      { name: "Access-Control-Allow-Headers", value: "content-type, x-custom" },
      ...(credentials ? [{ name: "Access-Control-Allow-Credentials", value: "true" }] : []),
    ];
    const decide = (
      policy: LabPolicy | null,
      p: Record<string, unknown>,
      stage: string,
    ): Action => {
      const req = p.request as { method: string };
      if (!policy || policy.name === "continue") return { cmd: "continue" };
      if (policy.name === "fulfillPreflight" && req.method === "OPTIONS") {
        return {
          cmd: "Fetch.fulfillRequest",
          params: {
            responseCode: 204,
            responseHeaders: corsHeaders(policy.origin, policy.credentials),
          },
        };
      }
      if (stage === "Response") {
        const original = (p.responseHeaders as { name: string; value: string }[]).filter(
          (h) => !h.name.toLowerCase().startsWith("access-control-"),
        );
        return {
          cmd: "Fetch.continueResponse",
          params: {
            responseCode: p.responseStatusCode,
            responseHeaders: [...original, ...corsHeaders(policy.origin, policy.credentials)],
          },
        };
      }
      return { cmd: "continue" };
    };
    const g = globalThis as unknown as Record<string, unknown>;
    g.labEvents = [];
    g.labTimings = [];
    g.labPolicy = null;
    await chrome.debugger.attach({ tabId: id }, "1.3");
    chrome.debugger.onEvent.addListener(async (source, method, params) => {
      if (source.tabId !== id) return;
      const events = g.labEvents as unknown[];
      const p = params as Record<string, unknown>;
      if (method === "Network.requestWillBeSent") {
        const req = p.request as { method: string; url: string };
        events.push({ method, type: p.type, reqMethod: req.method, url: req.url });
      } else if (method === "Network.loadingFailed") {
        events.push({
          method,
          type: p.type,
          errorText: p.errorText,
          corsErrorStatus: p.corsErrorStatus,
        });
      } else if (method === "Network.responseReceived") {
        const r = p.response as { status: number; url: string };
        events.push({ method, type: p.type, status: r.status, url: r.url });
      } else if (method === "Fetch.requestPaused") {
        const req = p.request as { method: string; url: string };
        const stage = p.responseStatusCode === undefined ? "Request" : "Response";
        events.push({
          method,
          stage,
          reqMethod: req.method,
          url: req.url,
          resourceType: p.resourceType,
          status: p.responseStatusCode,
        });
        const action = decide(g.labPolicy as LabPolicy | null, p, stage);
        const requestId = p.requestId as string;
        const t0 = performance.now();
        try {
          if (action.cmd === "continue") {
            await chrome.debugger.sendCommand(
              source,
              stage === "Request" ? "Fetch.continueRequest" : "Fetch.continueResponse",
              { requestId },
            );
          } else {
            await chrome.debugger.sendCommand(source, action.cmd, { requestId, ...action.params });
          }
          (g.labTimings as number[]).push(performance.now() - t0);
        } catch (e) {
          events.push({ method: "lab.error", cmd: action.cmd, error: (e as Error).message });
          await chrome.debugger
            .sendCommand(source, "Fetch.continueRequest", { requestId })
            .catch(() => {});
        }
      }
    });
  }, tabId);
}

export const labSend = (
  worker: Worker,
  tabId: number,
  method: string,
  params: Record<string, unknown> = {},
) =>
  worker.evaluate(({ id, m, p }) => chrome.debugger.sendCommand({ tabId: id }, m, p), {
    id: tabId,
    m: method,
    p: params,
  });

export const labEvents = (worker: Worker) =>
  worker.evaluate(() => {
    const g = globalThis as unknown as { labEvents: unknown[] };
    const events = g.labEvents;
    g.labEvents = [];
    return events;
  });

export type LabPolicy =
  | { name: "continue" }
  | { name: "addCors"; origin: string; credentials: boolean }
  | { name: "fulfillPreflight"; origin: string; credentials: boolean };

/** Tiempos (ms) entre requestPaused y la respuesta del comando de continuación, en el SW. */
export const labTimings = (worker: Worker) =>
  worker.evaluate(() => {
    const g = globalThis as unknown as { labTimings: number[] };
    const t = g.labTimings;
    g.labTimings = [];
    return t;
  });

export function percentile(values: number[], p: number) {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) return NaN;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return Math.round((sorted[Math.max(0, idx)] ?? NaN) * 100) / 100;
}

export const setPolicy = (worker: Worker, policy: LabPolicy | null) =>
  worker.evaluate((p) => {
    (globalThis as unknown as Record<string, unknown>).labPolicy = p;
  }, policy);
