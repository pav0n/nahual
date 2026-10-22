# Quickstart: validar el spike CDP

## Requisitos

- Node.js 24 LTS y pnpm 10 (`corepack enable`).
- Chrome estable ≥ 120.
- La app de pruebas del equipo (SPA + API en otro origen) corriendo en local o staging.

## Instalar, verificar y construir

```bash
pnpm install --frozen-lockfile
pnpm lint && pnpm typecheck && pnpm test     # unitarias + integración (CDP simulado)
pnpm build                                   # apps/extension/dist
pnpm verify:dist                             # manifest, sin red propia, sin parámetro de test
pnpm --filter extension e2e                  # Playwright con la extensión cargada
```

Esperado: todo en verde; cobertura ≥ 85% en `packages/*`; `verify:dist` pasa
(ver [contracts/manifest.md](./contracts/manifest.md)).

## Cargar la extensión

1. `chrome://extensions` → Modo desarrollador → **Cargar descomprimida** → `apps/extension/dist`.
2. Abrir la app de pruebas, abrir DevTools y elegir el panel **Nahual**.

## Escenarios de validación (manual)

| # | Paso | Resultado esperado | Spec |
|---|---|---|---|
| 1 | Pulsar **Adjuntar** | Barra de aviso de Chrome visible; panel en "adjunto" | AS-1, FR-001/002 |
| 2 | Patrón `*api*` etapa Request; provocar una llamada | Aparece en la lista de pausados con cuenta regresiva de 30 s | AS-3, FR-008/011 |
| 3 | **Continuar** sin cambios | La app recibe la respuesta normal | AS-3 |
| 4 | Pausar otra, añadir `X-Nahual: 1`, continuar | El servidor de la API registra el header | AS-4 |
| 5 | Patrón en etapa Response; añadir un header de respuesta | La app ve el header (Network de DevTools) | AS-5 |
| 6 | Timeout a 5 s; no actuar | A los 5 s se continúa sin cambios y el panel lo indica | FR-011 |
| 7 | Timeout a 200 | Mensaje con el rango válido; se conserva el valor | Edge case |
| 8 | Pulsar **Cancelar** en la barra de Chrome | Panel en "desconectado" con causa en < 1 s y botón **Reconectar** | AS-6, SC-002 |
| 9 | **Reconectar** | Vuelve a "adjunto" al primer intento | FR-003 |
| 10 | Con un request pausado, recargar la extensión en `chrome://extensions` | La app recibe su respuesta en < 5 s; sin barra de aviso | AS-7, SC-003 |
| 11 | Cerrar DevTools con el debugger adjunto | La barra de aviso desaparece | AS-8, FR-004 |
| 12 | Cambiar idioma de Chrome a inglés | Todo el panel en inglés | FR-016 |

## Experimentos y criterio de salida

Ejecutar E1–E5 según [research.md](./research.md) (scripts en `apps/extension/e2e/experiments/`)
y completar sus secciones de resultado. La feature termina cuando E5 da 0 sesiones huérfanas y
0 requests sin resolver, y las decisiones D1–D5 están confirmadas o actualizadas con los datos.
