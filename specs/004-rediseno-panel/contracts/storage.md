# Contrato: almacenamiento (004)

`chrome.storage.local` **sin cambios** respecto a [003](../../003-cors-desarrollo/contracts/storage.md):
mismas claves (`nahual.rules.v1`, `nahual.settings.v1`) y solo el SW escribe.

## Nuevo: preferencias de interfaz en `localStorage` del panel (research R3)

| Clave | Contenido | Escribe | Lee |
|---|---|---|---|
| `nahual.ui.v1` | JSON `UiPrefs` ([data-model](../data-model.md#uiprefs-r3-localstorage-nahualuiv1)) | El panel, al soltar o mover el divisor y al cambiar el alto del cajón | El panel, al abrir |

- Solo disposición de la interfaz: nunca URLs, headers, bodies, reglas ni ajustes.
- Lectura con schema: JSON inválido, versión distinta o campo fuera de rango ⇒ default de ese
  campo, sin aviso al dev (FR-034).
- Acceso protegido con `try/catch`: si `localStorage` no está disponible, el panel usa los
  defaults y no guarda.
- Escritura con `debounce` de 250 ms durante el arrastre del divisor.

## Pruebas

- Unitarias: lectura de valores válidos, inválidos, de otra versión y ausentes; recorte al rango.
- `storage-privacy.spec.ts` amplía su comprobación: tras una sesión E2E completa, `nahual.ui.v1`
  solo contiene los campos de `UiPrefs` y ningún dato de tráfico.
