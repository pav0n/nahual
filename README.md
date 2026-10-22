# Nahual

> En la tradición mesoamericana, el *nahual* es el ser que cambia de forma.
> Nahual transforma el tráfico HTTP de tu app sin que lo note.

Extensión de Chrome para desarrolladores frontend: intercept condicional, CORS de desarrollo
seguro, repeater + diff, hooks en TypeScript y exportación al código. Todo local, sin cuenta.

**Estado:** spike técnico (feature `001-spike-cdp`). Ver `.specify/memory/constitution.md`,
`docs/speckit-inputs/` y `specs/001-spike-cdp/`.

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

Guía de validación completa: [`specs/001-spike-cdp/quickstart.md`](specs/001-spike-cdp/quickstart.md).

## Desarrollo

El proyecto se construye con [GitHub Spec Kit](https://github.com/github/spec-kit) y Claude Code:

1. `/speckit-specify` con el archivo de la feature (ej. `docs/speckit-inputs/01-spike-cdp.md`).
2. `/speckit-clarify`, `/speckit-plan`, `/speckit-tasks`, `/speckit-analyze`.
3. `/speckit-implement`.

## Licencia

[Apache-2.0](LICENSE).
