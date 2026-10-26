// Rasteriza docs/brand/*.svg a los PNG de public/icons con el Chromium de Playwright, que ya es
// dependencia de desarrollo. Se ejecuta a mano cuando cambia el logo y los PNG se commitean: el
// build no rasteriza nada (specs/007-export-publicacion/contracts/manifest.md).
import { chromium } from "@playwright/test";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../../..");
const out = path.join(root, "apps/extension/public/icons");
const targets = [
  ...[16, 32, 48, 128].map((size) => ({ svg: "nahual.svg", size, file: `icon-${size}.png` })),
  { svg: "nahual-mono.svg", size: 16, file: "panel-16.png" },
];

await mkdir(out, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
for (const { svg, size, file } of targets) {
  const source = await readFile(path.join(root, "docs/brand", svg), "utf8");
  const sized = source.replace('width="128" height="128"', `width="${size}" height="${size}"`);
  await page.setContent(`<body style="margin:0">${sized}</body>`);
  await page.locator("svg").screenshot({ path: path.join(out, file), omitBackground: true });
}
await browser.close();
