// SBOM CycloneDX 1.6 del paquete de la extensión (007, FR-040, contracts/release.md). Sin
// dependencias: lista las dependencias de producción con `pnpm list --prod`, toma la licencia del
// `package.json` de cada una y el hash `sha512` del lockfile. Determinista: sin fecha y con el
// serialNumber derivado del SHA-256 del zip (`scripts/build-zip.mjs`).
// Uso: node scripts/build-sbom.mjs [--out ruta] [--zip ruta]
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? path.resolve(process.argv[i + 1]) : fallback;
};
const zipFile = arg("--zip", path.join(root, "apps/extension/nahual.zip"));
const outFile = arg("--out", path.join(root, "apps/extension/nahual.sbom.cdx.json"));

const app = JSON.parse(readFileSync(path.join(root, "apps/extension/package.json"), "utf8"));
const listing = JSON.parse(
  execFileSync("pnpm", ["list", "--prod", "--json", "--depth", "Infinity", "--filter", app.name], {
    cwd: root,
    encoding: "utf8",
  }),
);

/** `name@version` ⇒ integridad del lockfile (`sha512-…` en base64). */
function lockIntegrities() {
  const lock = readFileSync(path.join(root, "pnpm-lock.yaml"), "utf8");
  const map = new Map();
  for (const match of lock.matchAll(
    /^ {2}'?(@?[^@\s'][^@\s']*)@([^:'\s(]+)'?:\n {4}resolution: \{integrity: (sha512-[^,}]+)/gm,
  ))
    map.set(`${match[1]}@${match[2]}`, match[3]);
  return map;
}
const integrities = lockIntegrities();

const packages = new Map();
function walk(dependencies = {}) {
  for (const [name, info] of Object.entries(dependencies)) {
    // Los paquetes del monorepo (`link:`) no se publican: se recorren sus dependencias.
    if (!info.version.startsWith("link:")) {
      const key = `${name}@${info.version}`;
      if (!packages.has(key)) packages.set(key, { name, version: info.version, path: info.path });
    }
    walk(info.dependencies);
  }
}
for (const project of listing) walk(project.dependencies);

const purlOf = (name, version) => `pkg:npm/${name.replace(/^@/, "%40")}@${version}`;
const licenseOf = (dir) => {
  const pkg = JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8"));
  const license = typeof pkg.license === "string" ? pkg.license : pkg.license?.type;
  if (!license) throw new Error(`${pkg.name}@${pkg.version} no declara licencia`);
  return license;
};
const hexOf = (integrity) =>
  Buffer.from(integrity.slice("sha512-".length), "base64").toString("hex");

const components = [...packages.values()]
  .map(({ name, version, path: dir }) => {
    const scoped = name.startsWith("@");
    const [group, short] = scoped ? name.split("/") : [undefined, name];
    const purl = purlOf(name, version);
    const integrity = integrities.get(`${name}@${version}`);
    return {
      type: "library",
      "bom-ref": purl,
      ...(group ? { group } : {}),
      name: short,
      version,
      purl,
      licenses: [{ license: { id: licenseOf(dir) } }],
      hashes: integrity ? [{ alg: "SHA-512", content: hexOf(integrity) }] : [],
    };
  })
  .sort((a, b) => (a.purl < b.purl ? -1 : a.purl > b.purl ? 1 : 0));

/** UUID v5 con el formato de CycloneDX, a partir del SHA-256 del zip. */
function serialNumber() {
  const hex = createHash("sha256").update(readFileSync(zipFile)).digest("hex");
  const variant = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  return `urn:uuid:${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

const self = purlOf(app.name, app.version);
const bom = {
  bomFormat: "CycloneDX",
  specVersion: "1.6",
  serialNumber: serialNumber(),
  version: 1,
  metadata: {
    component: {
      type: "application",
      "bom-ref": self,
      group: "@nahual",
      name: "extension",
      version: app.version,
      purl: self,
    },
    tools: { components: [{ type: "application", name: "nahual build-sbom" }] },
  },
  components,
};

writeFileSync(outFile, `${JSON.stringify(bom, null, 2)}\n`);
console.log(`${components.length} componentes  ${path.relative(root, outFile)}`);
