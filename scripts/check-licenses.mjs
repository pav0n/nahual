// Verifica que toda dependencia tenga una licencia compatible con Apache-2.0 (FR-018a).
import { execFileSync } from "node:child_process";

const PROD_ALLOWED = new Set(["MIT", "Apache-2.0", "ISC", "BSD-2-Clause", "BSD-3-Clause", "0BSD"]);
// Solo herramientas de desarrollo, nunca empaquetadas: MPL-2.0 (axe-core), BlueOak-1.0.0
// (permisiva; minimatch) y CC-BY-4.0 (datos de
// caniuse-lite, que llega vía browserslist).
const DEV_ALLOWED = new Set([...PROD_ALLOWED, "MPL-2.0", "BlueOak-1.0.0", "CC-BY-4.0"]);

function licenses(flag) {
  const out = execFileSync("pnpm", ["licenses", "list", "--json", flag, "--recursive"], {
    encoding: "utf8",
  });
  return JSON.parse(out);
}

// Una expresión SPDX "A OR B" basta con que una opción esté permitida.
const isAllowed = (license, allowed) =>
  license
    .replace(/[()]/g, "")
    .split(/\s+OR\s+/)
    .some((option) => allowed.has(option.trim()));

let failures = 0;
for (const [flag, allowed] of [
  ["--prod", PROD_ALLOWED],
  ["--dev", DEV_ALLOWED],
]) {
  for (const [license, pkgs] of Object.entries(licenses(flag))) {
    if (isAllowed(license, allowed)) continue;
    for (const pkg of pkgs) {
      console.error(`${flag}: ${pkg.name}@${pkg.versions.join(",")} tiene licencia ${license}`);
      failures++;
    }
  }
}

if (failures > 0) {
  console.error(`${failures} dependencia(s) con licencia no permitida.`);
  process.exit(1);
}
console.log("Licencias OK.");
