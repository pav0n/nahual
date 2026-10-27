import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DIST, DIST_TEST, filesContaining, readJson } from "./helpers.ts";

// Contrato: specs/001-spike-cdp/contracts/manifest.md (+ 005: host opcional; 006: sandbox;
// 007: versión 1.0.0 e iconos)
const manifest = readJson(path.join(DIST, "manifest.json")) as Record<string, unknown>;

describe("manifest.json de producción", () => {
  it("declara solo los permisos debugger y storage", () => {
    expect(manifest.permissions).toEqual(["debugger", "storage"]);
  });

  it("tiene la CSP estricta de extension_pages y la del sandbox de hooks (006)", () => {
    expect(manifest.content_security_policy).toEqual({
      extension_pages: "script-src 'self'; object-src 'self'",
      sandbox:
        "sandbox allow-scripts; default-src 'none'; script-src 'self' 'unsafe-eval' blob:; " +
        "worker-src blob:; connect-src 'none'; img-src 'none'; style-src 'none'; " +
        "frame-src 'none'; form-action 'none'; base-uri 'none'",
    });
  });

  it("declara solo la página sandbox de hooks (006)", () => {
    expect(manifest.sandbox).toEqual({ pages: ["src/sandbox/hook-sandbox.html"] });
  });

  it("es MV3 con locale por defecto es y Chrome ≥ 120", () => {
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.default_locale).toBe("es");
    expect(manifest.minimum_chrome_version).toBe("120");
    expect(manifest.name).toBe("__MSG_extName__");
    expect(manifest.description).toBe("__MSG_extDescription__");
  });

  it("tiene service worker de tipo módulo y devtools_page", () => {
    expect(manifest.background).toMatchObject({ type: "module" });
    expect(manifest.devtools_page).toBe("src/devtools/devtools.html");
  });

  it("declara como opcionales solo los hosts http y https, sin conceder ninguno (005)", () => {
    expect(manifest.optional_host_permissions).toEqual(["http://*/*", "https://*/*"]);
  });

  it("tiene la versión 1.0.0 (007)", () => {
    expect(manifest.version).toBe("1.0.0");
  });

  it("declara los cuatro iconos y están en dist (007)", () => {
    const icons = { 16: "icon-16.png", 32: "icon-32.png", 48: "icon-48.png", 128: "icon-128.png" };
    expect(manifest.icons).toEqual(
      Object.fromEntries(Object.entries(icons).map(([size, file]) => [size, `icons/${file}`])),
    );
    for (const file of [...Object.values(icons), "panel-16.png"])
      expect(existsSync(path.join(DIST, "icons", file))).toBe(true);
  });

  it.each(["clipboardWrite", "downloads", "unlimitedStorage", "alarms", "declarativeNetRequest"])(
    "no pide el permiso %s (007, research R15)",
    (permission) => {
      const permissions = manifest.permissions as string[];
      expect(permissions.filter((p) => p.startsWith(permission))).toEqual([]);
    },
  );

  it.each([
    "host_permissions",
    "optional_permissions",
    "content_scripts",
    "externally_connectable",
    "web_accessible_resources",
  ])("no declara %s", (field) => {
    expect(manifest).not.toHaveProperty(field);
  });
});

describe("manifest.json del build de pruebas (005, research X2)", () => {
  it("concede solo los servidores locales, que Playwright no puede pedir por diálogo", () => {
    const test = readJson(path.join(DIST_TEST, "manifest.json")) as Record<string, unknown>;
    expect(test.host_permissions).toEqual(["http://127.0.0.1/*"]);
  });
});

describe("_locales", () => {
  const keys = (lang: string) =>
    Object.keys(readJson(path.join(DIST, "_locales", lang, "messages.json")) as object).sort();

  it("es y en tienen exactamente las mismas claves", () => {
    expect(keys("en")).toEqual(keys("es"));
    expect(keys("es").length).toBeGreaterThan(0);
  });
});

describe("parámetro de pruebas del panel", () => {
  it("no existe en el build de producción", () => {
    expect(filesContaining(DIST, "__nahualTestTabId")).toEqual([]);
  });

  it("existe en el build de pruebas", () => {
    expect(filesContaining(DIST_TEST, "__nahualTestTabId").length).toBeGreaterThan(0);
  });
});

describe("fallos inyectables del build de pruebas (SC-003)", () => {
  it("no existen en el build de producción", () => {
    expect(filesContaining(DIST, "__nahualFaults")).toEqual([]);
  });

  it("existen en el build de pruebas", () => {
    expect(filesContaining(DIST_TEST, "__nahualFaults").length).toBeGreaterThan(0);
  });
});

describe("escala de tiempo de las relajaciones CORS del build de pruebas (003, research R16)", () => {
  it("no existe en el build de producción", () => {
    expect(filesContaining(DIST, "__nahualCorsTimeScale")).toEqual([]);
    expect(filesContaining(DIST, "__nahualLabTabs")).toEqual([]);
  });

  it("existe en el build de pruebas", () => {
    expect(filesContaining(DIST_TEST, "__nahualCorsTimeScale").length).toBeGreaterThan(0);
  });
});
