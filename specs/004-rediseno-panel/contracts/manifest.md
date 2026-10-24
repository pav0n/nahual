# Contrato: manifest (004)

**Sin cambios de permisos** respecto a [003](../../003-cors-desarrollo/contracts/manifest.md):
`debugger` y `storage`, sin host permissions. Solo cambia la versión a `0.4.0`.

| API usada por el rediseño | Permiso | Nota |
|---|---|---|
| `chrome.devtools.panels.themeName` | Ninguno (requiere `devtools_page`, ya declarado) | Desde 001 |
| `chrome.devtools.panels.setThemeChangeHandler` | Ninguno | Nuevo uso; Chrome 99+ (mínimo de Nahual: 120) |
| `localStorage` del panel | Ninguno | Preferencias de interfaz ([storage.md](./storage.md)) |

`verify:dist` sigue comprobando permisos y que los ganchos de prueba (`__nahualUiSlots`, además
de los de 002 y 003) no llegan al build de producción.
