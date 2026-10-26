// Imagen promocional pequeña de la Chrome Web Store (440×280, obligatoria) desde
// docs/brand/nahual.svg, con el Chromium de Playwright como render-icons.mjs. Se ejecuta a mano y
// el PNG se commitea en docs/store/assets/ (docs/store/assets/README.md).
import { chromium } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../../..");
const logo = (await readFile(path.join(root, "docs/brand/nahual.svg"), "utf8")).replace(
  'width="128" height="128"',
  'width="104" height="104"',
);

const html = `<!doctype html><meta charset="utf-8"><style>
  *{box-sizing:border-box}
  body{margin:0;width:440px;height:280px;overflow:hidden;display:flex;align-items:center;gap:20px;padding:0 30px;
    color:#e8eaed;font-family:system-ui,"Segoe UI",Roboto,"Liberation Sans",sans-serif;
    background:radial-gradient(circle at 92% -15%,rgba(30,184,224,.38),transparent 55%),
      radial-gradient(circle at -10% 115%,rgba(43,228,160,.26),transparent 50%),#0d1117}
  svg{flex:none;filter:drop-shadow(0 12px 28px rgba(0,0,0,.55))}
  h1{margin:0;font-size:38px;font-weight:800;letter-spacing:6px}
  p{margin:6px 0 16px;font-size:11.5px;font-weight:700;letter-spacing:1.6px;white-space:nowrap;
    background:linear-gradient(90deg,#1eb8e0,#2be4a0);-webkit-background-clip:text;background-clip:text;color:transparent}
  ul{margin:0;padding:0;list-style:none;font-size:14px;line-height:1.55;color:#a8b3c1}
  li::before{content:"";display:inline-block;width:6px;height:6px;border-radius:50%;background:#2be4a0;margin:0 9px 2px 0}
</style>
${logo}
<div>
  <h1>NAHUAL</h1>
  <p>DEVTOOLS TRAFFIC TOOLKIT</p>
  <ul><li>Pause and edit in flight</li><li>Rewrite with TypeScript</li><li>Export to tests and mocks</li></ul>
</div>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 440, height: 280 }, deviceScaleFactor: 1 });
await page.setContent(html);
await page.screenshot({ path: path.join(root, "docs/store/assets/promo-440x280.png") });
await browser.close();
