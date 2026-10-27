# Marca

- `nahual.svg`: logo e icono de la extensión. Un coyote facetado, el *nahual*, con el flujo de
  tráfico por el centro. Fondo `#0D1117`; cian `#1EB8E0` y verde `#2BE4A0`.
- `nahual-mono.svg`: versión monocroma sin fondo para el icono del panel de DevTools.
- Lema: **DevTools traffic toolkit**.

Los PNG de `apps/extension/public/icons/` se generan desde estos SVG y se commitean; el build no
rasteriza nada. Si cambia el logo:

```bash
pnpm --filter @nahual/extension exec node scripts/render-icons.mjs
```

El script usa el Chromium de Playwright (`pnpm --filter @nahual/extension exec playwright install
chromium`) y escribe `icon-16.png`, `icon-32.png`, `icon-48.png`, `icon-128.png` y
`panel-16.png`.
