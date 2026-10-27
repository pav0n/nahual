# Justificación de permisos (FR-044)

Respuestas para la pestaña de privacidad del Developer Dashboard. Corresponden al manifest de
`apps/extension/manifest.config.ts` (verificado por `tests/dist/manifest.test.ts`) y al listing.
Cualquier permiso nuevo exige primero su justificación en el `plan.md` de la feature
(constitución, principio I).

## Propósito único

Inspeccionar y modificar el tráfico HTTP de la pestaña que el desarrollador depura con DevTools
(reglas, CORS de desarrollo, repeater, hooks y exportación a código), todo dentro de su
navegador.

| Permiso | Justificación (es) | Justification (en) |
|---|---|---|
| `debugger` | Nahual captura, pausa y modifica el tráfico de la pestaña con el Chrome DevTools Protocol (dominios `Network` y `Fetch`). Se adjunta solo mientras el panel de Nahual está abierto en esa pestaña y se suelta al cerrarlo; Chrome muestra su barra amarilla durante todo ese tiempo. No se usa para nada más. | Nahual captures, pauses and modifies the tab's traffic with the Chrome DevTools Protocol (`Network` and `Fetch` domains). It attaches only while the Nahual panel is open in that tab and detaches when it closes; Chrome shows its yellow bar the whole time. It is used for nothing else. |
| `storage` | Guarda en `chrome.storage.local` las reglas, los perfiles y los ajustes del desarrollador, y en `chrome.storage.session` qué pestañas tienen el debugger adjunto (para soltarlas tras un reinicio). Nunca guarda tráfico, bodies ni credenciales. | Stores the developer's rules, profiles and settings in `chrome.storage.local`, and in `chrome.storage.session` which tabs have the debugger attached (to release them after a restart). It never stores traffic, bodies or credentials. |
| `optional_host_permissions` (`http://*/*`, `https://*/*`) | Opcional. Solo lo pide el repeater en "contexto limpio", al enviar un request que el desarrollador escribió, y solo para el origen exacto de ese request. Se puede retirar en Ajustes ⇒ General. Sin conceder nada, todo lo demás funciona. | Optional. Only requested by the repeater's "clean context" when sending a request the developer wrote, and only for that request's exact origin. It can be removed in Settings ⇒ General. Without granting anything, everything else works. |
| `sandbox` (página `src/sandbox/hook-sandbox.html`) | No es un permiso. Aísla el código de los hooks del desarrollador: sin red (`connect-src 'none'`), sin `chrome.*` y sin acceso a la página. Es la única parte con `unsafe-eval`, limitado a su CSP de sandbox. | Not a permission. Isolates the developer's hook code: no network (`connect-src 'none'`), no `chrome.*`, no page access. It is the only part with `unsafe-eval`, limited to its sandbox CSP. |

## Código remoto

**No.** Todo el código va en el paquete. Los hooks son código que el propio desarrollador escribe
o importa, se muestran como texto antes de activarse y solo se evalúan en la página sandbox.

## Permisos que no se usan

`tabs`, `scripting`, `downloads`, `clipboardWrite`, `unlimitedStorage`, `alarms` y
`declarativeNetRequest*` no están en el manifest: copiar y descargar se hacen desde el panel con
un gesto del usuario, y el CORS de desarrollo usa el debugger (decisión de 003).
