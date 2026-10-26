# Capturas y video del listing

Generados por `apps/extension/e2e/store/screenshots.spec.ts` con la extensión real (build de
pruebas) y los servidores de prueba en puertos fijos (`127.0.0.1:5173` la app, `:8787` la API):

```bash
pnpm build:test
LANG=en_US.UTF-8 pnpm --filter @nahual/extension e2e:store
```

Interfaz en inglés. La Chrome Web Store admite hasta 5 capturas de 1280×800 por idioma; hay un
juego en tema claro (`light/`) y otro en oscuro (`dark/`): se sube uno de los dos, o se mezclan.

| Archivo | Muestra |
|---|---|
| `1-traffic-debugging.png` | Tráfico con el detalle de un request, dentro de DevTools, y la barra de Chrome "“Nahual” started debugging this browser" con su botón Cancel |
| `2-rules.png` | Reglas: una pausa condicional (status ≥ 500) y un hook en TypeScript |
| `3-repeater-diff.png` | Repeater: el request reenviado a otra URL y el diff JSON contra la respuesta original |
| `4-export-curl.png` | "Export as…" en cURL, con los 2 valores sensibles redactados |
| `5-profiles.png` | Selector de perfil de la pestaña ("All rules", "QA staging", "Bug 1234") y las reglas con sus perfiles |

**Composición en la captura 1.** Chrome sin interfaz no dibuja la ventana, la barra de depuración
ni DevTools. La captura 1 los reproduce alrededor del panel real: la pestaña, la barra de
direcciones, la barra de depuración con su texto real, una página de ejemplo ("Demo store") y las
pestañas de DevTools. El panel de Nahual es la captura real. Las capturas 2 a 5 son el panel tal
cual.

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
