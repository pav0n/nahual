import { expect, type BrowserContext, type Page, type Worker } from "@playwright/test";

/** tabId de la pestaña con esa URL, vía chrome.debugger.getTargets (sin permiso "tabs"). */
export async function tabIdOf(worker: Worker, url: string): Promise<number> {
  const find = () =>
    worker.evaluate(
      async (u) => (await chrome.debugger.getTargets()).find((t) => t.url === u)?.tabId ?? -1,
      url,
    );
  await expect.poll(find).toBeGreaterThanOrEqual(0);
  return find();
}

/**
 * Pestañas en las que Nahual sigue adjunto. getTargets no dice qué cliente está adjunto
 * (research D6): se prueba un comando inocuo, que solo funciona si la sesión es nuestra.
 */
export function ownSessions(worker: Worker) {
  return worker.evaluate(async () => {
    const tabs = (await chrome.debugger.getTargets()).flatMap((t) =>
      t.attached && t.tabId !== undefined ? [t.tabId] : [],
    );
    const own: number[] = [];
    for (const tabId of tabs) {
      try {
        await chrome.debugger.sendCommand({ tabId }, "Target.getTargetInfo");
        own.push(tabId);
      } catch {
        // No es nuestra.
      }
    }
    return own;
  });
}

export async function openApp(context: BrowserContext, appOrigin: string) {
  const app = await context.newPage();
  await app.goto(`${appOrigin}/`);
  return app;
}

/** Abre el panel fuera de DevTools (solo build de pruebas, research D7). */
export async function openPanel(context: BrowserContext, extensionId: string, tabId: number) {
  const panel = await context.newPage();
  await panel.goto(
    `chrome-extension://${extensionId}/src/panel/panel.html?__nahualTestTabId=${tabId}`,
  );
  await expect(panel.locator(".status > [role=status]")).toBeVisible();
  return panel;
}

export const statusOf = (panel: Page) => panel.locator(".status > [role=status]");

export async function attach(panel: Page) {
  await panel.getByRole("button", { name: /^Attach/ }).click();
  await expect(statusOf(panel)).toContainText("Attached");
}

export interface ConditionSpec {
  /** Texto de la opción de tipo, p. ej. "Status", "Header", "Body JSONPath". */
  kind: string;
  /** Texto de la opción de operador, p. ej. "≥", "is empty", "equals". */
  op?: string;
  /** Campos por etiqueta, p. ej. { Value: "500" } o { JSONPath: "$.items" }. */
  fields?: Record<string, string>;
  /** Opciones de select por etiqueta (p. ej. { "GraphQL response": "Has errors" }). */
  selects?: Record<string, string>;
  /** Casillas por nombre (métodos). */
  checks?: string[];
}

export interface RuleSpec {
  name: string;
  pattern: string;
  stage: "request" | "response";
  regex?: boolean;
  methods?: string[];
  types?: string[];
  conditions?: ConditionSpec[];
}

export const openTab = (panel: Page, name: "Traffic" | "Rules" | "Queue") =>
  panel.getByRole("tab", { name: new RegExp(`^${name}`) }).click();

/** Crea una regla desde el editor del panel (historia 2). */
export async function createRule(panel: Page, spec: RuleSpec) {
  await openTab(panel, "Rules");
  await panel.getByRole("button", { name: /^(Create your first rule|New rule)$/ }).click();
  const editor = panel.locator(".editor");
  await editor.getByLabel("Name", { exact: true }).fill(spec.name);
  if (spec.regex) await editor.getByLabel("Prefilter type").selectOption("regex");
  await editor.getByLabel("URL prefilter").fill(spec.pattern);
  for (const method of spec.methods ?? []) {
    await editor
      .locator("fieldset.types")
      .first()
      .getByRole("checkbox", { name: method, exact: true })
      .check();
  }
  for (const type of spec.types ?? []) {
    await editor
      .locator("fieldset.types")
      .nth(1)
      .getByRole("checkbox", { name: type, exact: true })
      .check();
  }
  await editor.getByLabel("Stage").selectOption(spec.stage);
  for (const condition of spec.conditions ?? []) {
    await editor.getByRole("button", { name: "Add condition" }).click();
    const fieldset = editor.locator("fieldset.condition").last();
    await fieldset.getByLabel("Type").selectOption({ label: condition.kind });
    if (condition.op) await fieldset.getByLabel("Operator").selectOption({ label: condition.op });
    for (const [label, value] of Object.entries(condition.selects ?? {})) {
      await fieldset.getByLabel(label, { exact: true }).selectOption({ label: value });
    }
    for (const name of condition.checks ?? []) {
      await fieldset.getByRole("checkbox", { name, exact: true }).check();
    }
    for (const [label, value] of Object.entries(condition.fields ?? {})) {
      await fieldset.getByLabel(label, { exact: true }).fill(value);
    }
  }
  await editor.getByRole("button", { name: "Save rule" }).click();
  await expect(panel.locator(".editor")).toHaveCount(0);
  await expect(panel.locator(".rule-item").filter({ hasText: spec.name })).toBeVisible();
}

/** Ajusta el timeout de pausa desde los ajustes del panel. */
export async function setPauseTimeout(panel: Page, seconds: number) {
  const settings = panel.locator("details.settings");
  if (!(await settings.getAttribute("open"))) await settings.locator("summary").click();
  await settings.getByLabel(/Pause timeout/).fill(String(seconds));
  await settings.getByRole("button", { name: "Apply" }).click();
}

/** Item de la cola (abre la pestaña Cola). */
export const pausedOption = (panel: Page, text: string | RegExp) =>
  panel.locator(".queue").getByRole("option").filter({ hasText: text });

export async function openQueue(panel: Page) {
  await openTab(panel, "Queue");
}

export const pausedEditor = (panel: Page) => panel.locator(".paused-editor");

/** Lanza un fetch desde la app sin esperarlo (quedará pausado). */
export function startFetch(app: Page, url: string) {
  return app.evaluate(async (u) => {
    const r = await fetch(u);
    return {
      status: r.status,
      url: r.url,
      nahualResponse: r.headers.get("x-nahual-response"),
      body: await r.text(),
    };
  }, url);
}

/** Llama a una ruta de la SPA de prueba (servers.ts) y devuelve su resultado. */
export function callApi(app: Page, id: string) {
  return app.evaluate(
    (callId) =>
      (
        window as unknown as {
          call(id: string): Promise<{ id: string; status?: number; body?: string; error?: string }>;
        }
      ).call(callId),
    id,
  );
}

export const trafficGrid = (panel: Page) => panel.getByRole("grid", { name: /traffic/i });

export const trafficRow = (panel: Page, text: string | RegExp) =>
  trafficGrid(panel).getByRole("row").filter({ hasText: text });

/** Activa o desactiva un fallo inyectable del build de pruebas (test-hooks.ts). */
export function setFault(worker: Worker, fault: string, on: boolean) {
  return worker.evaluate(
    ([name, enabled]) => {
      const faults = (globalThis as { __nahualFaults?: Set<string> }).__nahualFaults;
      if (!faults) throw new Error("build sin fallos inyectables");
      if (enabled) faults.add(name as string);
      else faults.delete(name as string);
    },
    [fault, on] as const,
  );
}

/** Adjunta y recarga la app para capturar su tráfico desde el principio. */
export async function attachAndReload(panel: Page, app: Page) {
  await attach(panel);
  await app.reload();
}

export interface CorsCallResult {
  id: string;
  status?: number;
  total?: string | null;
  body?: string;
  error?: string;
}

/** Llama a una ruta CORS de la SPA de prueba (servers.ts, 003). */
export function corsCall(app: Page, id: string) {
  return app.evaluate(
    (callId) =>
      (window as unknown as { corsCall(id: string): Promise<CorsCallResult> }).corsCall(callId),
    id,
  );
}

/** Fila de la lista con esa ruta que no es un preflight (la fila empieza por el método). */
export const requestRow = (panel: Page, path: string) =>
  trafficRow(panel, path).filter({ hasNotText: /^OPTIONS/ });

/** Abre el detalle de la última fila (no preflight) con esa ruta. */
export async function openCorsDetail(panel: Page, path: string) {
  await requestRow(panel, path).last().click();
  await expect(panel.locator(".detail h2")).toContainText(path);
  return panel.locator(".detail .cors");
}

export const relaxIndicator = (panel: Page) => panel.locator(".relax-indicator");

/**
 * Relaja CORS desde el detalle de un request bloqueado: "Allow CORS for development" y
 * "Allow" (2 clics, SC-001). `configure` toca la confirmación antes de permitir.
 */
export async function relaxFrom(
  panel: Page,
  path: string,
  configure?: (form: ReturnType<Page["locator"]>) => Promise<void>,
) {
  const section = await openCorsDetail(panel, path);
  await section.getByRole("button", { name: "Allow CORS for development" }).click();
  const form = section.locator(".relax-form");
  if (configure) await configure(form);
  await form.getByRole("button", { name: "Allow", exact: true }).click();
  await expect(relaxIndicator(panel)).toBeVisible();
  return section;
}

/** Añade una entrada a la lista de orígenes de producción desde los ajustes. */
export async function addProductionOrigin(panel: Page, entry: string) {
  const settings = panel.locator("details.settings");
  if (!(await settings.getAttribute("open"))) await settings.locator("summary").click();
  await settings.getByLabel(/^Add origin or pattern/).fill(entry);
  await settings.getByRole("button", { name: "Add", exact: true }).click();
  await expect(settings.locator(".production-list")).toContainText(entry);
}

/** Abre el detalle del último request relajado con esa ruta, esperando a que llegue su fila. */
export async function openRelaxedDetail(panel: Page, path: string) {
  const row = requestRow(panel, path).filter({ hasText: "CORS relaxed" }).last();
  await expect(row).toBeVisible();
  await row.click();
  await expect(panel.locator(".detail h2")).toContainText(path);
  return panel.locator(".detail .cors");
}

/**
 * Crea relajaciones extra desde un puerto auxiliar de la página del panel (solo pruebas): el
 * `hello` desplaza al panel, que se reconecta solo y vuelve a ser el dueño sin soltar el
 * debugger. Sirve para tener 10 orígenes relajados sin 10 servidores.
 */
export function relaxExtraOrigins(panel: Page, tabId: number, appOrigin: string, count: number) {
  return panel.evaluate(
    async ({ tab, app, n }) => {
      const port = chrome.runtime.connect({ name: "nahual-panel" });
      const replies = new Map<string, (ok: boolean) => void>();
      port.onMessage.addListener((m: { type: string; correlationId?: string }) => {
        if (m.correlationId && replies.has(m.correlationId))
          replies.get(m.correlationId)?.(m.type === "ack");
      });
      const send = (type: string, payload: object) =>
        new Promise<boolean>((resolve) => {
          const id = crypto.randomUUID();
          replies.set(id, resolve);
          port.postMessage({ v: 3, id, type, payload });
        });
      await send("hello", { tabId: tab });
      const results: boolean[] = [];
      for (let i = 0; i < n; i++) {
        results.push(
          await send("relaxCors", {
            appOrigin: app,
            apiOrigin: `https://extra${i}.test`,
            durationMinutes: 480,
            exposeHeaders: [],
            credentials: false,
          }),
        );
      }
      return results;
    },
    { tab: tabId, app: appOrigin, n: count },
  );
}
