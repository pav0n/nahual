# Capturas y video del listing

Generados por `apps/extension/e2e/store/screenshots.spec.ts` con la extensión real (build de
pruebas) y los servidores de prueba en puertos fijos (`127.0.0.1:5173` la app, `:8787` la API):

```bash
pnpm build:test
LANG=en_US.UTF-8 pnpm --filter @nahual/extension e2e:store
```

Interfaz en inglés. La Chrome Web Store admite hasta 5 capturas de 1280×800 por idioma; hay un
juego con el panel en tema claro (`light/`) y otro en oscuro (`dark/`): se sube uno de los dos, o
se mezclan.

Cada captura es un cartel: la marca, un titular con algo que DevTools no hace (o no hace fácil) y
el panel real dentro de una ventana de DevTools.

| Archivo | Titular | Muestra |
|---|---|---|
| `1-pause-edit.png` | Pause and edit responses in flight | Un `500` pausado por una regla con condición (status ≥ 500), con status, headers y body editables; encima, la barra de Chrome "“Nahual” started debugging this browser" |
| `2-cors.png` | Know why CORS blocked it | La causa de un bloqueo (`*` con credenciales) explicada, y el formulario de relajación acotada |
| `3-hooks.png` | Rewrite traffic with TypeScript hooks | El editor de un hook con un error de tipos detectado al escribir |
| `4-repeater-diff.png` | Replay any request and diff the result | Un request reenviado a otra URL y el diff JSON contra la respuesta original |
| `5-export.png` | Turn real traffic into tests and mocks | "Export as…" a un test de Vitest, con 3 valores sensibles redactados |

**Composición.** Chrome sin interfaz no dibuja DevTools ni la barra de depuración. Los carteles
reproducen las pestañas de DevTools y, en la captura 1, la barra con su texto real; el panel de
Nahual es la captura real.

## Imagen promocional

`promo-440x280.png` es la imagen promocional pequeña (440×280) que la tienda exige: el logo, la
marca, el tagline y tres funciones. La genera `apps/extension/scripts/render-promo.mjs` desde
`docs/brand/nahual.svg`:

```bash
pnpm --filter @nahual/extension exec node scripts/render-promo.mjs
```

## Video

`demo.webm` (1280×800, tema oscuro, unos 110 s) lo genera `apps/extension/e2e/store/video.spec.ts`:
graba el panel real con una portada, un subtítulo por paso en una franja inferior propia (el panel
se encoge para que el subtítulo nunca tape un control) y un resalte en cada control antes de
usarlo. Las vistas importantes se quedan de 4 a 5 s en pantalla. La Chrome Web Store no aloja
videos: se sube a YouTube y se pega el enlace en el listing.

Sin pantalla, Chrome no dibuja la barra de depuración pero encoge el área grabada, así que la
grabación usa `--silent-debugger-extension-api` y el video no la muestra; la captura 1 sí.

Guion:

| Paso | Subtítulos | Qué se ve |
|---|---|---|
| Portada | NAHUAL · DevTools traffic toolkit | "Pause, rewrite, replay and export your app's traffic, right inside DevTools, on the tab you're already debugging." |
| 1 | Attach to the tab you're debugging | Adjuntar y recargar; aparece el tráfico |
| 2 | Pause only what matters · A 500 is held before the page sees it · Edit the response in flight · The page got your response | Se escribe la regla con la condición status ≥ 500; un `500` queda pausado; se cambia a `200` con otro body y continúa; el detalle muestra la respuesta editada |
| 3 | Know why CORS blocked it · Relax it for this tab only · The retry goes through | La causa explicada; "Allow CORS for development" ⇒ "Allow"; el reintento pasa y la barra avisa de la relajación |
| 4 | Rewrite traffic with TypeScript hooks · Caught before it runs · Fixed: ready to run · See every run | Se escribe un hook con un error de tipos, que se marca; se corrige y se guarda; la pestaña Hooks muestra la ejecución, el cambio y el tiempo |
| 5 | Replay any request and diff the result · Every change, field by field | Repeater a otra URL y diff contra el original |
| 6 | Turn real traffic into tests and mocks · A Vitest test… · An MSW handler… | "Export as…" a Vitest y a MSW, con los secretos redactados |
| Cierre | Free · Local · No account · No telemetry | |
