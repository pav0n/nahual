# Nahual

> En la tradición mesoamericana, el *nahual* es el ser que cambia de forma.
> Nahual transforma el tráfico HTTP de tu app sin que lo note.

Extensión de Chrome para desarrolladores frontend: intercept condicional, CORS de desarrollo
seguro, repeater + diff, hooks en TypeScript y exportación al código. Todo local, sin cuenta.

**Estado:** features `002-captura-intercept`, `003-cors-desarrollo` y `004-rediseno-panel`: ver el
tráfico de la pestaña, crear reglas y pausar, simular o retrasar solo lo que cumple una condición,
entender y relajar CORS de desarrollo de forma acotada, en un panel con el aspecto de DevTools. Ver
`.specify/memory/constitution.md`, `docs/speckit-inputs/` y `specs/`.

## Qué hace

- **Panel integrado en DevTools**: mismos colores, tipografía y densidad que los paneles nativos,
  en tema claro y oscuro (sigue al de DevTools en vivo). Una barra con las secciones **Tráfico**,
  **Reglas** (con el número de reglas activas) y **Pausados** (resaltado si hay alguno); a la
  derecha, el estado de la sesión (un clic abre un menú con la causa, la solución y
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
  "Permitir CORS para desarrollo".
- **Reglas por sitio**: prefiltro de URL (glob o regex), métodos, tipos de recurso, etapa (Request
  o Response) y condiciones (status, header, query param, JSONPath, GraphQL). La primera de la
  lista gana; se reordenan con `Alt+↑`/`Alt+↓`.
- **Acciones de las reglas**: Pausar (editable desde el detalle en Tráfico o desde Pausados, con
  cuenta regresiva), Mock, Fallar, Retrasar y Solo registrar. Plantillas: pausar respuestas con error o vacías, simular API caída o red lenta.
- **CORS de desarrollo**: los requests bloqueados por CORS se marcan en la lista y el detalle
  explica la causa, qué pidió la app y qué respondió el servidor. "Permitir CORS para desarrollo"
  relaja CORS solo en esa pestaña, para el origen de la app y el de la API (origen exacto, nunca
  `*`), con un indicador permanente, cuenta regresiva (8 h como máximo) y fin al soltar el
  debugger o reiniciar Nahual. Los orígenes de producción se marcan en Ajustes ⇒ CORS de
  desarrollo y nunca se relajan. "Generar reporte para backend" produce un texto copiable con lo que el servidor debe
  configurar y ejemplos para Express, NestJS, AWS API Gateway y Google Cloud Run.
- **Seguro por defecto**: nada sale del navegador; el historial vive en memoria; todo request
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

## Requisitos

- Node.js 24 LTS y pnpm 10 (`corepack enable`).
- Chrome 120 o superior.

## Construir y probar

```bash
pnpm install --frozen-lockfile
pnpm lint && pnpm typecheck && pnpm test   # unitarias + integración con CDP simulado
pnpm build                                 # apps/extension/dist
pnpm verify:dist                           # manifest, sin red propia, sin código evaluado
pnpm --filter @nahual/extension exec playwright install chromium
pnpm e2e                                   # Playwright con la extensión cargada
pnpm --filter @nahual/extension e2e:visual  # capturas de regresión visual (claro/oscuro, 320/800/1280 px)
EXPERIMENTS=1 pnpm --filter @nahual/extension e2e   # experimentos de research.md
```

## Cargar la extensión

1. `chrome://extensions` → Modo desarrollador → **Cargar descomprimida** → `apps/extension/dist`.
2. Abre la página que quieras inspeccionar, abre DevTools y elige el panel **Nahual**.

Para probar con una app de ejemplo (SPA en `http://127.0.0.1:4310`, API en `:4311` y un tercer
origen en `:4312`, con rutas `/cors/*` que provocan cada causa de bloqueo):

```bash
pnpm --filter @nahual/extension fixture:serve
```

Guías de validación:
[`specs/002-captura-intercept/quickstart.md`](specs/002-captura-intercept/quickstart.md) y
[`specs/003-cors-desarrollo/quickstart.md`](specs/003-cors-desarrollo/quickstart.md).

## Desarrollo

El proyecto se construye con [GitHub Spec Kit](https://github.com/github/spec-kit) y Claude Code:

1. `/speckit-specify` con el archivo de la feature (ej. `docs/speckit-inputs/01-spike-cdp.md`).
2. `/speckit-clarify`, `/speckit-plan`, `/speckit-tasks`, `/speckit-analyze`.
3. `/speckit-implement`.

## Licencia

[Apache-2.0](LICENSE).
