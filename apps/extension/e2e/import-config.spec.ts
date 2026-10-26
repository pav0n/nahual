import type { BrowserContext, Page, Worker } from "@playwright/test";
import { readFile } from "node:fs/promises";
import {
  attachAndReload,
  closeSettings,
  corsCall,
  createRule,
  openApp,
  openPanel,
  openSection,
  openSettings,
  relaxFrom,
  tabIdOf,
} from "./fixtures/panel.ts";
import type { TestServers } from "./fixtures/servers.ts";
import { expect, test } from "./fixtures/extension.ts";

// 007 US4: configuración portable (FR-026 a FR-033, SC-007, SC-008; quickstart 14–16).

interface Fx {
  context: BrowserContext;
  nahualWorker: Worker;
  extensionId: string;
  servers: TestServers;
}

async function setup({ context, nahualWorker, extensionId, servers }: Fx) {
  const app = await openApp(context, servers.appOrigin);
  const tabId = await tabIdOf(nahualWorker, `${servers.appOrigin}/`);
  const panel = await openPanel(context, extensionId, tabId);
  await panel.setViewportSize({ width: 1100, height: 800 });
  await attachAndReload(panel, app);
  return { app, panel };
}

const ruleItem = (panel: Page, name: string) =>
  panel.locator(".rule-item").filter({ hasText: name });

async function importFile(panel: Page, name: string, content: string) {
  const dialog = await openSettings(panel, "Import and export");
  await dialog.locator('input[type="file"][aria-label="Import configuration"]').setInputFiles({
    name,
    mimeType: "application/json",
    buffer: Buffer.from(content),
  });
  return dialog;
}

test("US4-1..5, SC-008: exportar redactado, importar con vista previa, desactivado, y deshacer", async ({
  context,
  nahualWorker,
  extensionId,
  servers,
}) => {
  const { app, panel } = await setup({ context, nahualWorker, extensionId, servers });
  await corsCall(app, "cors-none");
  await relaxFrom(panel, "/cors/none");
  await createRule(panel, {
    name: "Con token",
    pattern: "*/api/*",
    stage: "response",
    conditions: [
      {
        kind: "Header",
        op: "equals",
        fields: { "Header name": "Authorization", Value: "Bearer secret-rule" },
      },
    ],
  });
  const profiles = await openSettings(panel, "Profiles");
  await profiles.getByLabel("New profile").fill("QA");
  await profiles.getByRole("button", { name: "Create profile" }).click();
  await expect(panel.getByRole("button", { name: "Delete profile: QA" })).toBeVisible();

  // Exportar: resumen, nota de CORS y archivo sin el secreto ni la relajación.
  const data = await openSettings(panel, "Import and export");
  await expect(data).toContainText(
    "1 rules on 1 sites · 0 hooks · 1 profiles · 0 production origins",
  );
  await expect(data).toContainText("CORS relaxations are never exported.");
  const download = panel.waitForEvent("download");
  await data.getByRole("button", { name: "Download" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^nahual-config-\d{4}-\d{2}-\d{2}\.json$/);
  const text = await readFile(await file.path(), "utf8");
  expect(text).not.toContain("secret-rule");
  expect(text).toContain("<nahual:redacted>");
  expect(text).not.toMatch(/relax/i);
  await closeSettings(panel);

  // Borrar todo e importar.
  await openSection(panel, "Rules");
  await ruleItem(panel, "Con token")
    .getByRole("button", { name: "Delete rule “Con token”" })
    .click();
  const settings = await openSettings(panel, "Profiles");
  await settings.getByRole("button", { name: "Delete profile: QA" }).click();
  await importFile(panel, "config.json", text);
  const preview = panel.getByRole("dialog", { name: "Import configuration" });
  await expect(preview).toContainText("Con token");
  await expect(preview).toContainText("Has redacted values");
  await expect(preview.locator(".profile-tag")).toHaveText(["QA"]);
  await preview.getByRole("button", { name: "Import (turned off)" }).click();
  await expect(preview).toBeHidden();
  await expect(panel.getByText("Imported 1 rules and 1 profiles")).toBeVisible();
  await closeSettings(panel);

  await openSection(panel, "Rules");
  const imported = ruleItem(panel, "Con token");
  await expect(imported.getByRole("switch")).not.toBeChecked();
  await expect(imported.locator(".tag").first()).toHaveText("imported");
  // No se activa hasta completar el valor redactado (FR-028).
  await imported.getByRole("switch").click();
  await expect(imported).toContainText("Fill in the redacted values before turning the rule on");
  await expect(imported.getByRole("switch")).not.toBeChecked();
});

test("US4-6, SC-007: archivos inválidos se rechazan en línea y no cambian nada", async ({
  context,
  nahualWorker,
  extensionId,
  servers,
}) => {
  const { panel } = await setup({ context, nahualWorker, extensionId, servers });
  const cases: [string, string][] = [
    ["nope", "The file isn't JSON"],
    [JSON.stringify({ nahual: "otra" }), "This isn't a Nahual configuration"],
    [
      JSON.stringify({ nahual: "config", version: 7 }),
      "The file is from a newer version of Nahual",
    ],
    [
      JSON.stringify({
        nahual: "config",
        version: 1,
        app: "1",
        exportedAt: "x",
        redacted: { count: 0, rules: [] },
        productionOrigins: ["no es un origen"],
        sites: [],
      }),
      "The file is invalid at productionOrigins.0",
    ],
  ];
  for (const [content, message] of cases) {
    const dialog = await importFile(panel, "bad.json", content);
    await expect(dialog.getByRole("alert")).toContainText(message);
  }
  await expect(panel.getByRole("dialog", { name: "Import configuration" })).toHaveCount(0);
  await closeSettings(panel);
  await openSection(panel, "Rules");
  await expect(panel.locator(".rule-item")).toHaveCount(0);
});

test("FR-031: deshacer una importación (10 s) la quita entera y deja los orígenes que ya estaban", async ({
  context,
  nahualWorker,
  extensionId,
  servers,
}) => {
  const { panel } = await setup({ context, nahualWorker, extensionId, servers });
  const config = {
    nahual: "config",
    version: 1,
    app: "1.0.0",
    exportedAt: "2026-10-26T00:00:00.000Z",
    redacted: { count: 0, rules: [] },
    productionOrigins: ["https://app.example.com"],
    sites: [
      {
        site: servers.appOrigin,
        profiles: [],
        rules: [
          {
            id: "3f1c2b4a-8d9e-4f60-a1b2-c3d4e5f60718",
            order: 0,
            name: "Importada",
            enabled: true,
            prefilter: { kind: "glob", pattern: "*/api/*" },
            methods: [],
            resourceTypes: [],
            stage: "response",
            conditions: [],
            profileIds: [],
            action: { kind: "pause" },
          },
        ],
      },
    ],
  };
  await importFile(panel, "c.json", JSON.stringify(config));
  const preview = panel.getByRole("dialog", { name: "Import configuration" });
  await expect(preview).toContainText("https://app.example.com");
  await expect(preview).toContainText("new");
  await preview.getByRole("button", { name: "Import (turned off)" }).click();
  await panel.getByRole("button", { name: "Undo" }).click();
  await closeSettings(panel);
  await openSection(panel, "Rules");
  await expect(panel.locator(".rule-item")).toHaveCount(0);
  const cors = await openSettings(panel, "Development CORS");
  await expect(cors).not.toContainText("https://app.example.com");
});
