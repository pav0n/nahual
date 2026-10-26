# Nahual

> En la tradición mesoamericana, el *nahual* es el ser que cambia de forma.
> Nahual transforma el tráfico HTTP de tu app sin que lo note.

Extensión de Chrome para desarrolladores frontend: intercept condicional, CORS de desarrollo
seguro, repeater + diff, hooks en TypeScript y exportación al código. Todo local, sin cuenta.

**Estado:** features `002-captura-intercept` a `006-hooks-typescript` terminadas y
`007-export-publicacion` en curso: ver el tráfico de la pestaña, crear reglas y pausar, simular o
retrasar solo lo que cumple una condición, entender y relajar CORS de desarrollo de forma acotada,
reenviar requests y comparar sus respuestas, modificarlos con hooks en TypeScript y exportarlos a
código, en un panel con el aspecto de DevTools. Ver
`.specify/memory/constitution.md`, `docs/adr/`, `docs/speckit-inputs/` y `specs/`.

## Qué hace

- **Panel integrado en DevTools**: mismos colores, tipografía y densidad que los paneles nativos,
  en tema claro y oscuro (sigue al de DevTools en vivo). Una barra con las secciones **Tráfico**,
  **Reglas** (con el número de reglas activas) y **Pausados** (resaltado si hay alguno); a la
  derecha, **Repeater** (con el número de pestañas), el estado de la sesión (un clic abre un menú con la causa, la solución y
  Soltar/Adjuntar/Reconectar), "Pausar Nahual", **Ajustes** y **Ayuda**. Bajo la barra, una línea
  por cada indicador: Nahual en pausa, CORS relajado y avisos del sistema (con más de 2, "N
  avisos" se despliega encima). Ajustes es un diálogo con secciones (General, Pausas, CORS de
  desarrollo, Atajos) que guarda cada campo al confirmarlo.
- **Tráfico**: filtros en una barra (búsqueda con alternador de regex, tipos, CORS, status,
  contador y limpiar con deshacer); lista con Nombre (ruta y host, marcas de CORS, pausado y
  preflight), Método, Status, Tipo, Tamaño y Tiempo; detalle a la derecha con un divisor que se
  arrastra o se mueve con flechas (debajo de la lista a menos de 600 px). El detalle abre en la
  pestaña que corresponde: CORS si fue bloqueado, Editar si está pausado, Headers si no. Headers
  sensibles enmascarados; historial de 2,000 entradas.
- **Acciones de un request**: la cabecera del detalle y el menú contextual de la lista (clic
  derecho, tecla de menú o `Shift+F10`) ofrecen las mismas acciones: "Crear regla desde este
  request" (abre Reglas con un borrador prellenado que no se guarda hasta confirmarlo) y
  "Enviar al repeater" y "Permitir CORS para desarrollo".
- **Repeater**: pestañas con una copia editable del request (método, URL, headers activables y
  body; un body binario se reenvía intacto). Dos modos, siempre visibles: **contexto de página**
  (sale desde la pestaña con sus cookies y su origen, pasa por tus reglas y la relajación CORS y
  aparece en Tráfico marcado "repeater") y **contexto limpio** (sale desde Nahual sin cookies ni
  sesión; la primera vez pide acceso a ese origen exacto, que se puede quitar en Ajustes ⇒
  General). `Ctrl/Cmd+Enter` envía; cada envío queda en el historial con status, tiempo y tamaño
  (50 por pestaña). Pestañas que se renombran, duplican y cierran con deshacer. Nada del repeater
  se guarda en disco.
- **Diff de respuestas**: compara la respuesta original, cualquier envío o una respuesta pegada.
  Status, headers y body: JSON por estructura (con la ruta de cada campo; los arrays se emparejan
  por `id`, `_id`, `uuid` o `key` si los tienen), texto por líneas, binarios solo por tamaño. Cada
  cambio lleva `+`, `−` o `~`; `J`/`K` los recorren. Los campos volátiles se ignoran y se recuerdan
  por endpoint (guardados bajo un hash, sin la URL). Tokens, cookies y contraseñas salen
  redactados (headers, campos JSON y parámetros de query) hasta pulsar "Mostrar valores
  sensibles".
- **Reglas por sitio**: prefiltro de URL (glob o regex), métodos, tipos de recurso, etapa (Request
  o Response) y condiciones (status, header, query param, JSONPath, GraphQL). La primera de la
  lista gana; se reordenan con `Alt+↑`/`Alt+↓`.
- **Acciones de las reglas**: Pausar (editable desde el detalle en Tráfico o desde Pausados, con
  cuenta regresiva), Mock, Fallar, Retrasar y Solo registrar. Plantillas: pausar respuestas con error o vacías, simular API caída o red lenta.
- **Hooks en TypeScript**: la acción "Modificar con hook" ejecuta una función que recibe el
  request o la respuesta reales y devuelve una versión cambiada (headers, body, status, URL) o
  responde sin llegar al servidor. El editor se parece a Sources: autocompletado y errores de tipo
  en vivo contra `HookContext`; un error de tipo impide activar la regla. Plantillas: agregar
  header, cambiar un campo del JSON y simular lista vacía. Si varias reglas con hook coinciden, se
  encadenan en orden y cada una recibe lo que dejó la anterior; `ctx.state` se comparte entre
  hooks hasta cerrar el panel. Cada hook corre aislado, sin red, sin acceso a la extensión ni a la
  página, con 2 s como máximo; si lanza, se pasa de tiempo o devuelve algo inválido, el request
  sigue sin cambios y tras 5 errores seguidos el hook se suspende (Reglas ⇒ Reanudar). Dos
  permisos por regla, apagados por defecto: leer valores sensibles (sin él, cookies y tokens
  llegan enmascarados) y cambiar el destino del request. La **consola de hooks**, en el cajón
  inferior como la de DevTools, muestra `ctx.log` y los errores con su línea (redactados hasta
  "Mostrar valores sensibles"); el contador de errores de la barra la abre filtrada. En Tráfico,
  la pestaña **Hooks** del detalle lista qué hook corrió, qué cambió y cuánto tardó. Un hook se
  exporta como un `.ts` con su configuración y se importa con vista previa del código, como regla
  nueva y desactivada, sin permisos; "Descargar tipos" da `nahual-hooks.d.ts` para tu editor.
- **CORS de desarrollo**: los requests bloqueados por CORS se marcan en la lista y el detalle
  explica la causa, qué pidió la app y qué respondió el servidor. "Permitir CORS para desarrollo"
  relaja CORS solo en esa pestaña, para el origen de la app y el de la API (origen exacto, nunca
  `*`), con un indicador permanente, cuenta regresiva (8 h como máximo) y fin al soltar el
  debugger o reiniciar Nahual. Los orígenes de producción se marcan en Ajustes ⇒ CORS de
  desarrollo y nunca se relajan. "Generar reporte para backend" produce un texto copiable con lo que el servidor debe
  configurar y ejemplos para Express, NestJS, AWS API Gateway y Google Cloud Run.
- **Exportar a código**: "Exportar como…" (en las acciones de un request, en la barra del repeater
  o con `Alt+Shift+E`) muestra el código antes de copiarlo o descargarlo: **cURL**, **fetch()**,
  **test Vitest** de contrato (llama a la API real y comprueba el status y la forma del body),
  **handler MSW**, **schema Zod** inferido de la respuesta y **colección de Postman**. Con varias
  filas marcadas en Tráfico, tres acciones por lote: un archivo de handlers MSW, un schema Zod de
  varias respuestas del mismo endpoint (campos ausentes ⇒ opcionales, `null` ⇒ nullable) y una
  colección de Postman. Cookies, tokens y contraseñas salen redactados (`<redacted>`, variables de
  entorno en el test Vitest, variables vacías en Postman); incluirlos pide confirmación y vale solo
  para esa exportación. Nada se guarda salvo el último formato elegido. Lo exportado se ejecuta de
  verdad en CI (`tooling/export-smoke`, con Vitest 5, MSW 3 y Zod 4).
- **Seguro por defecto**: nada sale del navegador salvo lo que reenvíes desde el repeater; el
  historial, el repeater y la consola y el `state` de los hooks viven en memoria; todo request
  pausado continúa sin cambios si vence su timeout, si Nahual falla o si se suelta el debugger.

## Atajos

Declarados en un solo lugar (`apps/extension/src/panel/shortcuts.ts`); Ajustes ⇒ Atajos y la Ayuda
los listan desde ahí.

| Atajo | Acción |
|---|---|
| `Alt+Shift+A` | Adjuntar / soltar el debugger |
| `Alt+Shift+P` | Pausar / reanudar Nahual |
| `Alt+Shift+C` | Continuar el pausado seleccionado |
| `Alt+Shift+K` | Continuar todos los pausados |
| `/` o `Alt+Shift+F` | Ir a la búsqueda de Tráfico |
| `Alt+Shift+R` | Apagar todas las relajaciones de CORS de la pestaña |
| `Alt+↑` / `Alt+↓` | Subir / bajar la regla enfocada |
| `Shift+F10` o tecla de menú | Menú de acciones de la fila enfocada |
| `Ctrl+Enter` / `Cmd+Enter` | Enviar el request de la pestaña del repeater |
| `J` / `K` | Cambio siguiente / anterior en el diff |
| `Ctrl+S` / `Cmd+S` | Guardar la regla que se edita |
| `Alt+Shift+E` | Exportar como código el request seleccionado |

## Requisitos

- Node.js 24 LTS y pnpm 10 (`corepack enable`).
- Chrome 120 o superior.
- Solo si cambia el logo: regenerar los iconos (`docs/brand/README.md`).

## Construir y probar

```bash
pnpm install --frozen-lockfile
pnpm lint && pnpm typecheck && pnpm test   # unitarias + integración con CDP simulado
pnpm build                                 # apps/extension/dist
pnpm verify:dist                           # manifest, sin red propia, sin código evaluado
pnpm --filter @nahual/extension exec playwright install chromium
pnpm e2e                                   # Playwright con la extensión cargada (workers: la mitad de los núcleos)
E2E_WORKERS=1 pnpm e2e                     # en serie (depurar); otro número fija los workers
pnpm --filter @nahual/extension e2e:visual  # capturas de regresión visual (claro/oscuro, 320/800/1280 px)
pnpm --filter @nahual/extension e2e:store   # capturas y video del listing en docs/store/assets
EXPERIMENTS=1 pnpm --filter @nahual/extension e2e   # experimentos de research.md
```

Las E2E esperan la interfaz en inglés. Si el sistema está en otro idioma, Chromium sin interfaz
ignora `--lang`: ejecútalas con `LANG=en_US.UTF-8 pnpm e2e`.

## Cargar la extensión

1. `chrome://extensions` → Modo desarrollador → **Cargar descomprimida** → `apps/extension/dist`.
2. Abre la página que quieras inspeccionar, abre DevTools y elige el panel **Nahual**. La
   extensión aparece con el icono del coyote (`docs/brand/nahual.svg`) en `chrome://extensions` y
   en el menú de extensiones.

Para probar con una app de ejemplo (SPA en `http://127.0.0.1:4310`, API en `:4311` y un tercer
origen en `:4312`, con rutas `/cors/*` que provocan cada causa de bloqueo):

```bash
pnpm --filter @nahual/extension fixture:serve
```

Guías de validación:
[`specs/002-captura-intercept/quickstart.md`](specs/002-captura-intercept/quickstart.md) y
[`specs/003-cors-desarrollo/quickstart.md`](specs/003-cors-desarrollo/quickstart.md).

## Instalar un release sin empaquetar

Mientras la Chrome Web Store revisa una versión, o para equipos que la prefieren así (FR-046):

1. Descarga `nahual.zip` del release en GitHub.
2. Verifica que es el que construyó CI (el SHA-256 está en las notas del release):

   ```bash
   echo "<sha256 del release>  nahual.zip" | sha256sum -c -
   gh attestation verify nahual.zip --repo <owner>/nahual
   ```

3. Descomprímelo en una carpeta y cárgala en `chrome://extensions` → Modo desarrollador →
   **Cargar descomprimida**. Sin la tienda no hay actualizaciones automáticas: repite con cada
   release.

## Verificar la reproducibilidad

Con el mismo Node (`.nvmrc`) y pnpm (`packageManager`), el mismo commit da el mismo paquete:

```bash
export SOURCE_DATE_EPOCH=1767225600
pnpm install --frozen-lockfile && pnpm build --force && node scripts/build-zip.mjs
node scripts/build-sbom.mjs   # SBOM CycloneDX 1.6 de las dependencias de producción
```

El SHA-256 que imprime `build-zip.mjs` debe coincidir con el del release.

## Publicación

El paquete publicado sale solo de CI (`.github/workflows/release.yml`, constitución VII): al
subir un tag `vX.Y.Z` que coincide con la versión de `apps/extension/package.json`, el job
`build` repite las comprobaciones de CI, construye dos veces y compara, genera el SBOM, firma
atestaciones de procedencia y del SBOM y crea el release. El job `publish` espera la aprobación
de un mantenedor en el environment `chrome-web-store` (el único con las credenciales de la
tienda), verifica el SHA-256 y la atestación del zip y lo sube y publica con la API de la Chrome
Web Store. El primer envío se hace a mano con el zip del release; listing, permisos, política de
privacidad y checklist en [`docs/store/`](docs/store/).

## Desarrollo

El proyecto se construye con [GitHub Spec Kit](https://github.com/github/spec-kit) y Claude Code:

1. `/speckit-specify` con el archivo de la feature (ej. `docs/speckit-inputs/01-spike-cdp.md`).
2. `/speckit-clarify`, `/speckit-plan`, `/speckit-tasks`, `/speckit-analyze`.
3. `/speckit-implement`.

## Licencia

[Apache-2.0](LICENSE).
