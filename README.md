# Nahual

> En la tradición mesoamericana, el *nahual* es el ser que cambia de forma.
> Nahual transforma el tráfico HTTP de tu app sin que lo note.

Extensión de Chrome para desarrolladores frontend: intercept condicional, CORS de desarrollo
seguro, repeater + diff, hooks en TypeScript y exportación al código. Todo local, sin cuenta.

**Estado:** features `002-captura-intercept` y `003-cors-desarrollo`: ver el tráfico de la pestaña,
crear reglas y pausar, simular o retrasar solo lo que cumple una condición, y entender y relajar
CORS de desarrollo de forma acotada. Ver
`.specify/memory/constitution.md`, `docs/speckit-inputs/` y `specs/`.

## Qué hace

- **Tráfico**: lista de los requests de la pestaña con método, URL, status, tipo, tamaño y tiempo;
  filtros por texto, regex, status y tipo; detalle con headers (los sensibles, enmascarados) y
  bodies; historial de 2,000 entradas que se puede limpiar con deshacer.
- **Reglas por sitio**: prefiltro de URL (glob o regex), métodos, tipos de recurso, etapa (Request
  o Response) y condiciones (status, header, query param, JSONPath, GraphQL). La primera de la
  lista gana; se reordenan con `Alt+↑`/`Alt+↓`.
- **Acciones**: Pausar (cola editable con cuenta regresiva), Mock, Fallar, Retrasar y Solo
  registrar. Plantillas: pausar respuestas con error o vacías, simular API caída o red lenta.
- **CORS de desarrollo**: los requests bloqueados por CORS se marcan en la lista y el detalle
  explica la causa, qué pidió la app y qué respondió el servidor. "Permitir CORS para desarrollo"
  relaja CORS solo en esa pestaña, para el origen de la app y el de la API (origen exacto, nunca
  `*`), con un indicador permanente, cuenta regresiva (8 h como máximo) y fin al soltar el
  debugger o reiniciar Nahual. Los orígenes de producción se marcan en Ajustes y nunca se
  relajan. "Generar reporte para backend" produce un texto copiable con lo que el servidor debe
  configurar y ejemplos para Express, NestJS, AWS API Gateway y Google Cloud Run.
- **Seguro por defecto**: nada sale del navegador; el historial vive en memoria; todo request
  pausado continúa sin cambios si vence su timeout, si Nahual falla o si se suelta el debugger.

## Atajos

| Atajo | Acción |
|---|---|
| `Alt+Shift+A` | Adjuntar / soltar el debugger |
| `Alt+Shift+P` | Pausar / reanudar Nahual |
| `Alt+Shift+C` | Continuar el item seleccionado de la cola |
| `Alt+Shift+K` | Continuar todos |
| `/` o `Alt+Shift+F` | Ir al buscador del tráfico |
| `Alt+Shift+R` | Apagar todas las relajaciones de CORS de la pestaña |

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
