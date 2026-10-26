import {
  expect,
  type BrowserContext,
  type Locator,
  type Page,
  type Worker,
} from "@playwright/test";
import { PROTOCOL_VERSION } from "@nahual/protocol";

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

/*
 * Helpers por rol y nombre accesible (004, research R16): sobreviven al rediseño del panel. Las
 * pruebas de 002 y 003 solo los usan a ellos para llegar a cada parte de la interfaz.
 */

/** Estado de la sesión: región `status` con nombre "Session" (texto completo del estado). */
export const sessionStatus = (panel: Page) => panel.getByRole("status", { name: "Session" });

/** Alias de 002/003. */
export const statusOf = sessionStatus;

/** Abre el panel fuera de DevTools (solo build de pruebas, research D7). */
export async function openPanel(context: BrowserContext, extensionId: string, tabId: number) {
  const panel = await context.newPage();
  await panel.goto(
    `chrome-extension://${extensionId}/src/panel/panel.html?__nahualTestTabId=${tabId}`,
  );
  await expect(sessionStatus(panel)).toBeAttached();
  return panel;
}

/**
 * Acción de la sesión (Adjuntar, Soltar, Reconectar): desde el menú del estado de sesión
 * (clarificación 3 de 004) o, en la interfaz anterior, desde su botón directo.
 */
export async function sessionAction(panel: Page, name: RegExp) {
  const trigger = panel.getByRole("button", { name: /^Session/ });
  if ((await trigger.count()) > 0) {
    await trigger.click();
    await panel.getByRole("menuitem", { name }).click();
  } else {
    await panel.getByRole("button", { name }).click();
  }
}

export async function attach(panel: Page) {
  await sessionAction(panel, /^Attach(?! and)/);
  await expect(sessionStatus(panel)).toContainText("Attached");
}

export const detach = (panel: Page) => sessionAction(panel, /^Detach/);

/** Comprueba que el estado de la sesión ofrece esa acción, sin ejecutarla. */
export async function expectSessionAction(panel: Page, name: RegExp) {
  const trigger = panel.getByRole("button", { name: /^Session/ });
  if ((await trigger.count()) > 0) {
    await trigger.click();
    await expect(panel.getByRole("menuitem", { name })).toBeVisible();
    await panel.keyboard.press("Escape");
  } else {
    await expect(panel.getByRole("button", { name })).toBeVisible();
  }
}

/** Adjunta o reconecta, según lo que ofrezca el estado de la sesión. */
export const attachOrReconnect = (panel: Page) =>
  sessionAction(panel, /^(Attach(?! and)|Reconnect)/);

/** Quita el foco de cualquier control, para que los atajos globales actúen. */
export const blurPanel = (panel: Page) =>
  panel.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());

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

export type Section = "Traffic" | "Rules" | "Paused" | "Repeater";

/** Pestaña de una sección de la barra; "Paused" se llamaba "Queue" antes de 004. */
export const sectionTab = (panel: Page, name: Section) =>
  panel.getByRole("tab", { name: name === "Paused" ? /^(Paused|Queue)/ : new RegExp(`^${name}`) });

export const openSection = (panel: Page, name: Section) => sectionTab(panel, name).click();

/** Crea una regla desde el editor del panel (historia 2). */
export async function createRule(panel: Page, spec: RuleSpec) {
  await openSection(panel, "Rules");
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

export type SettingsSection =
  "General" | "Pauses" | "Development CORS" | "Shortcuts" | "Profiles" | "Import and export";

/**
 * Abre Ajustes y devuelve su contenedor: el diálogo "Settings" con la sección pedida (004) o, en la
 * interfaz anterior, el `<details>` abierto.
 */
export async function openSettings(panel: Page, section?: SettingsSection) {
  const legacy = panel.locator("details.settings");
  if ((await legacy.count()) > 0) {
    if ((await legacy.getAttribute("open")) === null) await legacy.locator("summary").click();
    return legacy;
  }
  const dialog = panel.getByRole("dialog", { name: "Settings" });
  if (!(await dialog.isVisible())) {
    await panel.getByRole("button", { name: "Settings", exact: true }).click();
    await expect(dialog).toBeVisible();
  }
  if (section) await dialog.getByRole("tab", { name: section }).click();
  return dialog;
}

/** Cierra el diálogo de Ajustes si está abierto (la interfaz anterior no lo necesita). */
export async function closeSettings(panel: Page) {
  const dialog = panel.getByRole("dialog", { name: "Settings" });
  if (await dialog.isVisible()) {
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    await expect(dialog).toBeHidden();
  }
}

/** Ajusta el timeout de pausa desde los ajustes del panel. */
export async function setPauseTimeout(panel: Page, seconds: number) {
  const settings = await openSettings(panel, "Pauses");
  const field = settings.getByLabel(/Pause timeout/);
  await field.fill(String(seconds));
  const apply = settings.getByRole("button", { name: "Apply" });
  if ((await apply.count()) > 0) {
    await apply.click();
  } else {
    await field.press("Enter");
    await expect(settings.getByText("Saved")).toBeVisible();
  }
  await closeSettings(panel);
}

/** Item de la lista de pausados (abre la sección Pausados). */
export const pausedOption = (panel: Page, text: string | RegExp) =>
  panel.locator(".queue").getByRole("option").filter({ hasText: text });

export async function openQueue(panel: Page) {
  await openSection(panel, "Paused");
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

/** Filtro de texto (con `regex`, el de expresión regular: alternador en 004, campo propio antes). */
export async function filterTraffic(panel: Page, value: string, { regex = false } = {}) {
  const toggle = panel.getByRole("button", { name: "Use regular expression" });
  if ((await toggle.count()) > 0) {
    if ((await toggle.getAttribute("aria-pressed")) !== String(regex)) await toggle.click();
  }
  await panel.getByLabel(regex ? "URL regex" : "Search URLs").fill(value);
}

/** Filtro por tipo: botón de selección (004) o casilla (antes). */
export async function toggleTypeFilter(panel: Page, type: string) {
  const filters = panel.getByRole("search");
  const toggle = filters.getByRole("button", { name: type, exact: true });
  if ((await toggle.count()) > 0) await toggle.click();
  else await filters.getByRole("checkbox", { name: type, exact: true }).check();
}

/** Avisos del sistema con causa y solución (franja de indicadores en 004). */
export const notices = (panel: Page) => panel.locator(".notices");

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

/** Fila de la lista con esa ruta que no es un preflight (su celda de método no es OPTIONS). */
export const requestRow = (panel: Page, path: string) =>
  trafficRow(panel, path).filter({
    hasNot: panel.getByRole("gridcell", { name: "OPTIONS", exact: true }),
  });

/** Muestra la sección CORS del detalle abierto (pestaña CORS en 004; siempre visible antes). */
async function showCorsTab(panel: Page) {
  const tab = panel.locator(".detail").getByRole("tab", { name: "CORS", exact: true });
  if ((await tab.count()) > 0) await tab.click();
  return panel.locator(".detail .cors");
}

/** Abre el detalle de la última fila (no preflight) con esa ruta. */
export async function openCorsDetail(panel: Page, path: string) {
  await requestRow(panel, path).last().click();
  await expect(panel.locator(".detail h2")).toContainText(path);
  return showCorsTab(panel);
}

export const relaxIndicator = (panel: Page) => panel.locator(".relax-indicator");

/** Relajaciones del indicador, una por origen (en 004 se despliegan desde "Origins"). */
export async function relaxItems(panel: Page) {
  const indicator = relaxIndicator(panel);
  const toggle = indicator.getByRole("button", { name: /^Origins/ });
  if ((await toggle.count()) > 0 && (await toggle.getAttribute("aria-expanded")) !== "true") {
    await toggle.click();
  }
  return indicator.locator(".relax-item");
}

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

/** Añade una entrada a la lista de orígenes de producción desde los ajustes y los cierra. */
export async function addProductionOrigin(panel: Page, entry: string) {
  const settings = await openSettings(panel, "Development CORS");
  await settings.getByLabel(/^Add origin or pattern/).fill(entry);
  await settings.getByRole("button", { name: "Add", exact: true }).click();
  await expect(settings.locator(".production-list")).toContainText(entry);
  await closeSettings(panel);
}

/** Abre el detalle del último request relajado con esa ruta, esperando a que llegue su fila. */
export async function openRelaxedDetail(panel: Page, path: string) {
  const row = requestRow(panel, path).filter({ hasText: "CORS relaxed" }).last();
  await expect(row).toBeVisible();
  await row.click();
  await expect(panel.locator(".detail h2")).toContainText(path);
  return showCorsTab(panel);
}

/**
 * Crea relajaciones extra desde un puerto auxiliar de la página del panel (solo pruebas): el
 * `hello` desplaza al panel, que se reconecta solo y vuelve a ser el dueño sin soltar el
 * debugger. Sirve para tener 10 orígenes relajados sin 10 servidores.
 */
export function relaxExtraOrigins(
  panel: Page,
  tabId: number,
  appOrigin: string,
  count: number,
  apiOrigins?: string[],
) {
  return panel.evaluate(
    async ({ tab, app, n, apis, v }) => {
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
          port.postMessage({ v, id, type, payload });
        });
      await send("hello", { tabId: tab });
      const results: boolean[] = [];
      for (let i = 0; i < n; i++) {
        results.push(
          await send("relaxCors", {
            appOrigin: app,
            apiOrigin: apis?.[i] ?? `https://extra${i}.test`,
            durationMinutes: 480,
            exposeHeaders: [],
            credentials: false,
          }),
        );
      }
      return results;
    },
    { tab: tabId, app: appOrigin, n: count, apis: apiOrigins, v: PROTOCOL_VERSION },
  );
}

// Repeater (005).

export const repeater = (panel: Page) => panel.locator(".repeater");
export const repeaterResult = (panel: Page) => panel.locator(".send-result");
/** Pestañas del repeater (no las de su salida: Response, Headers, History, Diff). */
export const repeaterTabs = (panel: Page) =>
  repeater(panel).getByRole("tablist", { name: "Repeater tabs" });

/** Elige una pestaña de la salida del repeater. */
export async function repeaterOutputTab(
  panel: Page,
  name: "Response" | "Headers" | "History" | "Diff",
) {
  await repeater(panel).locator(".repeater-output").getByRole("tab", { name, exact: true }).click();
}
export const repeaterResponse = (panel: Page) => repeaterResult(panel).getByLabel("Response body");

/** "Send to repeater" desde el menú contextual de una fila (FR-001). */
export async function sendToRepeater(panel: Page, row: Locator) {
  await row.click({ button: "right" });
  await panel.getByRole("menu").getByRole("menuitem", { name: "Send to repeater" }).click();
  await expect(repeaterTabs(panel).getByRole("tab", { selected: true })).toBeVisible();
}

/** Modo de envío de la pestaña activa (FR-009). */
export const repeaterMode = (panel: Page, mode: "Page context" | "Clean context") =>
  repeater(panel).getByRole("group", { name: "Send mode" }).getByRole("button", { name: mode });

/** Envía la pestaña activa y espera a que el envío termine. */
export async function repeaterSend(panel: Page) {
  await repeater(panel).getByRole("button", { name: "Send", exact: true }).click();
  await expect(repeaterResult(panel).getByText("Sending…")).toHaveCount(0, { timeout: 15_000 });
}

// Hooks (006).

export interface HookInstall {
  name?: string;
  stage: "request" | "response";
  prefilter: string;
  source: string;
  permissions?: { changeDestination?: boolean; readSensitive?: boolean };
  enabled?: boolean;
}

/**
 * Guarda una regla con hook sin pasar por el editor (gancho `__nahualHooks` del build de
 * pruebas): el `check` se calcula como si el editor no hubiera encontrado errores.
 */
export async function installHook(panel: Page, hook: HookInstall) {
  const reply = await panel.evaluate(
    (h) =>
      (
        window as unknown as { __nahualHooks: { install(h: unknown): Promise<{ ok: boolean }> } }
      ).__nahualHooks.install(h),
    hook,
  );
  expect(reply.ok).toBe(true);
}

export interface HookExecutionView {
  ruleName: string;
  result: string;
  errorType?: string;
  message?: string;
  line?: number | null;
  logs: string[];
}

/** Ejecuciones de hooks que guarda el panel (memoria), de la más antigua a la más reciente. */
export const hookExecutions = (panel: Page) =>
  panel.evaluate(() =>
    (
      window as unknown as { __nahualHooks: { executions(): HookExecutionView[] } }
    ).__nahualHooks.executions(),
  );

/** `fetch` desde la app a una ruta de la API, con cookies; devuelve status y texto. */
export const appFetch = (app: Page, url: string, init: RequestInit = {}) =>
  app.evaluate(
    async ([u, i]) => {
      const response = await fetch(u, { credentials: "include", ...i });
      return { status: response.status, body: await response.text() };
    },
    [url, init] as const,
  );
