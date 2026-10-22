# Nahual — 06 · Exportar al código, perfiles y publicación

> Feature `006-export-publicacion`. Depende de: `003`, `004` y `005`.
> Objetivo: el diferenciador de Nahual. Llevar lo capturado al código del proyecto y publicar la extensión.

## Contexto para el agente

Nahual es una extensión de Chrome MV3 (`chrome.debugger` + CDP) para devs frontend. Ya existen captura, reglas, CORS de desarrollo, repeater + diff y hooks. Esta feature agrega exportadores, perfiles, importación de reglas de Requestly, configuración portable y la publicación en la Chrome Web Store.

---

## `/speckit.specify`

```text
Especifica la exportación, los perfiles y la publicación de Nahual.

P1 — Exportar al código
Como dev, quiero convertir un request capturado en código, para llevarlo a mis pruebas y mocks.
Aceptación:
- Un request (capturado o del repeater) se exporta a: cURL, fetch(), test Vitest, handler MSW y schema Zod inferido del response.
- Los exportadores redactan headers sensibles por defecto; incluirlos requiere una acción explícita con aviso.
- Vista previa del código antes de copiar o descargar.
- Exportación múltiple: varios requests a un solo archivo de handlers MSW.

P2 — Perfiles
Aceptación:
- Las reglas se agrupan en perfiles (ej. "QA staging", "Bug 1234") activables por pestaña.
- Cambiar de perfil es una acción de un clic con atajo, y el perfil activo siempre es visible.

P2 — Configuración portable
Aceptación:
- La configuración completa (reglas, hooks, perfiles) se exporta e importa como JSON versionado.
- Un JSON inválido se rechaza con un mensaje claro y sin cambios parciales.
- Lo importado queda desactivado por defecto, con vista previa de hooks.
- Las reglas CORS no se exportan sin confirmación explícita.

P3 — Importar desde Requestly
Aceptación:
- Se importan reglas exportadas de Requestly de tipo redirect, modify headers y modify response estático.
- Las reglas no soportadas se listan con el motivo; nada se importa a medias.

P1 — Publicación
Aceptación:
- La extensión se publica en la Chrome Web Store desde CI con un build reproducible y SBOM.
- El listing explica los permisos y la barra amarilla, con capturas.

Criterios de éxito:
- Un test Vitest exportado corre sin edición en un proyecto Vite estándar.
- Un handler MSW exportado reproduce la respuesta capturada.
- La extensión pasa la revisión de la Chrome Web Store.
```

## `/speckit.clarify` — preguntas sugeridas

1. ¿Qué versión de MSW y de Vitest se toma como objetivo de los exportadores?
2. ¿El schema Zod exportado debe marcar campos opcionales a partir de varios ejemplos capturados?
3. ¿Distribución adicional como extensión sin empaquetar para equipos internos mientras se aprueba la publicación?

## `/speckit.plan`

```text
Planifica sobre 003, 004 y 005.

packages/domain (TDD):
- Exportadores puros: cURL, fetch, Vitest, MSW, Zod (inferencia desde uno o varios ejemplos).
- Redacción compartida con la de diff y logs (una sola implementación).
- Schema versionado de configuración portable con migraciones.
- Conversor de reglas de Requestly al modelo de Nahual, con reporte de no soportadas.

apps/extension:
- UI de exportación con vista previa (Monaco solo lectura), copiar y descargar.
- Selector de perfiles y atajo.
- Importación de configuración y de Requestly con validación total antes de aplicar (transacción: todo o nada).

Publicación:
- Workflow de release en GitHub Actions: build reproducible, SBOM, firma de artefactos, subida a Chrome Web Store.
- Política de privacidad (cero recolección, todo local) y declaración de prácticas de datos coherente.
- Justificación de permisos: debugger, storage, unlimitedStorage, alarms, declarativeNetRequestWithHostAccess (si se usa), host permissions opcionales.

Pruebas: snapshots de cada exportador; ejecución real del test Vitest y del handler MSW exportados en un proyecto de prueba; importación de JSON inválido y parcial; E2E de perfiles.
```

## `/speckit.tasks`

```text
Genera tasks.md por historia (P1 exportar, P2 perfiles, P2 configuración, P3 Requestly, P1 publicación).
TDD en packages/domain. [P] en lo paralelizable. Ruta de archivo en cada tarea.
Incluye la checklist de publicación como tareas, revisión axe y checkpoint demostrable.
```

---

## Checklist de publicación en Chrome Web Store

- [ ] Justificación escrita de `debugger` y de host permissions opcionales.
- [ ] Justificación de `declarativeNetRequestWithHostAccess` si se usa (CORS de desarrollo, acotado por pestaña y en sesión).
- [ ] Política de privacidad: cero recolección de datos, todo local.
- [ ] Declaración de prácticas de datos coherente con la política.
- [ ] Sin código remoto ni `eval` fuera del sandbox.
- [ ] Capturas y video mostrando la barra amarilla y su motivo.
- [ ] Build generado desde CI con SBOM adjunto al release.
