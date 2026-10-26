import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";

// 007 (FR-040, contracts/release.md, data-model "Release"): SBOM CycloneDX 1.6 del paquete.

const ROOT = path.resolve(import.meta.dirname, "../../../..");
const env = { ...process.env, SOURCE_DATE_EPOCH: "1767225600" };
const run = (script: string, args: string[] = []) =>
  execFileSync(process.execPath, [path.join(ROOT, "scripts", script), ...args], {
    cwd: ROOT,
    env,
    encoding: "utf8",
  });

const Component = z.strictObject({
  type: z.literal("library"),
  "bom-ref": z.string(),
  group: z.string().optional(),
  name: z.string().min(1),
  version: z.string().min(1),
  purl: z.string().regex(/^pkg:npm\/[^@]+@[^@]+$/),
  licenses: z.array(z.strictObject({ license: z.strictObject({ id: z.string() }) })).min(1),
  hashes: z.array(z.strictObject({ alg: z.literal("SHA-512"), content: z.string().regex(/^[0-9a-f]{128}$/) })),
});
const Bom = z.strictObject({
  bomFormat: z.literal("CycloneDX"),
  specVersion: z.literal("1.6"),
  serialNumber: z.string().regex(/^urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/),
  version: z.literal(1),
  metadata: z.strictObject({
    component: z.strictObject({
      type: z.literal("application"),
      "bom-ref": z.string(),
      group: z.literal("@nahual"),
      name: z.literal("extension"),
      version: z.string(),
      purl: z.string(),
    }),
    tools: z.strictObject({
      components: z.array(z.strictObject({ type: z.literal("application"), name: z.string() })),
    }),
  }),
  components: z.array(Component),
});

describe("SBOM del paquete (T033)", () => {
  run("build-zip.mjs");
  const dir = mkdtempSync(path.join(tmpdir(), "nahual-sbom-"));
  const first = path.join(dir, "a.cdx.json");
  const second = path.join(dir, "b.cdx.json");
  run("build-sbom.mjs", ["--out", first]);
  run("build-sbom.mjs", ["--out", second]);
  const text = readFileSync(first, "utf8");
  const bom = Bom.parse(JSON.parse(text));
  const purls = bom.components.map((c) => c.purl);

  it("es CycloneDX 1.6 válido, sin fecha, y con la versión del paquete", () => {
    expect(text).not.toContain("timestamp");
    const pkg = JSON.parse(readFileSync(path.join(ROOT, "apps/extension/package.json"), "utf8")) as {
      version: string;
    };
    expect(bom.metadata.component.version).toBe(pkg.version);
  });

  it("es determinista: dos ejecuciones dan el mismo archivo", () => {
    expect(readFileSync(second, "utf8")).toBe(text);
  });

  it("lista cada dependencia de producción una vez, ordenadas, y ninguna de desarrollo", () => {
    expect(new Set(purls).size).toBe(purls.length);
    expect([...purls].sort()).toEqual(purls);
    for (const name of ["react", "react-dom", "zod", "json-p3", "sucrase", "@codemirror/view"])
      expect(purls.some((p) => p.startsWith(`pkg:npm/${name.replace("@", "%40")}@`)), name).toBe(true);
    for (const name of ["msw", "vitest", "@playwright/test", "vite", "eslint"])
      expect(purls.some((p) => p.startsWith(`pkg:npm/${name.replace("@", "%40")}@`)), name).toBe(false);
    expect(purls.some((p) => p.includes("%40nahual"))).toBe(false);
  });

  it("el serialNumber sale del SHA-256 del zip", () => {
    const sha = run("build-zip.mjs").split(" ")[0] ?? "";
    expect(bom.serialNumber.replaceAll("-", "").slice(9, 17)).toBe(sha.slice(0, 8));
  });
});
