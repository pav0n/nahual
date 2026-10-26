# Trabajo futuro

Lo que las features 001–007 dejaron fuera de alcance a propósito, y lo pedido para releases
posteriores. Cada punto se convierte en una feature con su entrada en `docs/speckit-inputs/` y el
flujo de Spec Kit completo; nada de aquí está decidido hasta su spec.

## Pedido para próximas releases

### Modificar requests y responses con archivos y bodies binarios

Hoy los bodies binarios, los mayores de 5 MB y `multipart/form-data` se reenvían intactos:
- 002: las condiciones sobre un body binario o mayor de 5 MB no se cumplen.
- 005: el repeater no edita bodies binarios ni multipart (fuera de alcance).
- 006: un hook recibe el tipo y el tamaño de un body binario, pero no el contenido.
- 007: los exportadores omiten el body binario y lo avisan.

La feature cubre:
- Mock con un archivo como body: imagen, fuente, PDF, video, `.wasm` o cualquier binario,
  elegido desde el panel, con su `Content-Type` y su tamaño.
- Reemplazar el body de un request o una response por un archivo (equivalente a "map local").
- Editar `multipart/form-data` en el repeater: campos y archivos.
- Acceso de los hooks al contenido binario (`ArrayBuffer`/`Uint8Array`) y la posibilidad de
  devolverlo.
- Vista previa en el detalle (imagen, hex) y exportación de esos bodies donde el formato lo
  permita.

A resolver en la spec: el límite de tamaño y dónde se guardan los archivos (cuota de `storage`;
`unlimitedStorage` u otro permiso solo con justificación), y qué viaja en la configuración
portable.

## Fuera de alcance en 007

- **Equipo y nube (de pago, principio VIII):** bibliotecas de perfiles o reglas compartidas y
  sincronización en la nube.
- **Exportar:**
  - A Playwright y HAR.
  - Sesiones de tráfico completas.
  - Un test Vitest autocontenido que monte el handler MSW. Hoy el test es de contrato y necesita
    el servidor real.
  - Selector de versiones de MSW y Zod en la vista previa.
- **Postman:** variables de entorno y scripts de pruebas.
- **Perfiles** que abarquen varios sitios. Hoy son por sitio, como las reglas.
- **Importar:**
  - De herramientas distintas de Requestly.
  - De Requestly, los tipos insert script, user agent, query param, delay, cancel, modify request
    body y modify response dinámica. Hoy se listan como no soportados.
- **Actualización automática** fuera de la Chrome Web Store.

## Riesgos aceptados que una feature futura podría cerrar

Documentados en `specs/007-export-publicacion/plan.md` ("Revisión de implementación"):
- **Variables de Postman:** Postman sustituye `{{nombre}}` en cualquier valor capturado.
- **Secretos en hooks:** el código de un hook viaja tal cual en la configuración portable.
  Detectar secretos literales en el código del hook y avisar al exportar lo reduciría.
