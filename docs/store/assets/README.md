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

## Video

`demo.webm` (1280×800, tema oscuro, unos 15 s) es la grabación del panel durante el recorrido.
La Chrome Web Store no aloja videos: se sube a YouTube y se pega el enlace en el listing.

Guion:

1. Panel sin adjuntar; "Session" ⇒ "Attach". El estado pasa a "Attached", la página se recarga y
   aparece su tráfico.
2. Nueva regla "Pause items" para `*/api/items` en la etapa Response.
3. La página pide `/api/items`: el request aparece en **Paused**; "Continue unchanged".
4. En **Traffic**, clic derecho en `/export/items` ⇒ "Export as…": cURL con valores redactados y
   luego el handler MSW.
5. "Session" ⇒ "Detach": Chrome quita la barra de depuración.

Para un video más largo con narración, el mismo guion sirve grabando la pantalla con Chrome
visible; así sale también la barra de depuración real.
