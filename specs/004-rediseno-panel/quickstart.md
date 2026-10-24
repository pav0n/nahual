# Quickstart: validar el rediseño del panel

## Requisitos

Los de [003](../003-cors-desarrollo/quickstart.md): Node.js 24, pnpm 10, Chrome estable ≥ 120.

## Verificar y construir

```bash
pnpm install --frozen-lockfile
pnpm lint && pnpm typecheck && pnpm test    # ruleDraftFromExchange (TDD), catálogo de acciones, atajos únicos, UiPrefs, SplitPane y Menu con teclado
pnpm build && pnpm verify:dist              # mismos permisos; sin __nahualUiSlots en producción
pnpm e2e                                    # 002 y 003 sin cambiar lo que verifican + estructura, menú contextual, Ajustes, avisos, lugares reservados, a11y en ambos temas
pnpm --filter @nahual/extension e2e:visual  # capturas en claro y oscuro a 320, 800 y 1280 px (research R14)
EXPERIMENTS=1 pnpm --filter @nahual/extension e2e   # D1 (tokens de DevTools) y lo existente
```

Esperado: todo en verde; 0 permisos y 0 dependencias nuevas; D1 y D2 registrados en
[research.md](./research.md#resultados).

## Validación manual (Chrome estable, perfil limpio)

`pnpm --filter @nahual/extension fixture:serve` y cargar `apps/extension/dist` sin empaquetar.
Abrir DevTools en la SPA de prueba, con los paneles **Network** y **Nahual** a mano para
compararlos.

| # | Paso | Esperado | Cubre |
|---|---|---|---|
| 1 | Abrir Nahual y Network lado a lado en tema claro; luego cambiar DevTools a oscuro con el panel abierto | Misma fuente, tamaño, alto de fila, fondo, barra, bordes y selección; el tema cambia sin recargar ni perder la selección | US1-1/2, FR-003/004, SC-006 |
| 2 | Mirar la barra superior | Tráfico, Reglas (contador de activas), Pausados; a la derecha estado de sesión, Pausar Nahual, Ajustes, Ayuda; sin título "Nahual" | US2-1, FR-010/011 |
| 3 | Clic en el estado de sesión | Menú con estado y "Soltar"; el clic no suelta nada; `Alt+Shift+A` sí actúa directo | FR-012 |
| 4 | Llamar a varias rutas de la API; abrir el detalle de una | Detalle a la derecha; la lista oculta Tipo, Tamaño y Tiempo; Nombre primero con ruta y host | US1-3, FR-007 |
| 5 | Arrastrar el divisor; enfocarlo y usar flechas; cerrar y reabrir DevTools | El reparto cambia y se recuerda | US1-4, FR-006 |
| 6 | Seleccionar un request y abrir Ajustes; cambiar el tiempo de pausa a 200, luego a 3 | Diálogo encima; la lista no se mueve; 200 se guarda solo con "Guardado"; 3 muestra el rango y no se guarda; al cerrar queda 200 | US2-3/4, FR-014/015, SC-001 |
| 7 | Crear la plantilla "Pausar respuestas con error" y llamar a `/api/error` | La fila aparece marcada "pausado"; su detalle abre en "Editar"; Continuar en 1 clic | US2-5, FR-016, SC-003 |
| 8 | Abrir Pausados con dos requests pausados | Se atienden uno tras otro; "Continuar todos" y `Alt+Shift+K` | US2-6, FR-017 |
| 9 | Clic derecho en una fila; repetir con `Shift+F10` sobre la fila enfocada | Menú con "Crear regla desde este request"; elegirla abre Reglas con el borrador prellenado y sin guardar | US3-2/3, FR-021/023 |
| 10 | Clic derecho en `/cors/preflight-401` bloqueado ⇒ "Permitir CORS para desarrollo" ⇒ "Permitir" | Misma confirmación de 003; franja "CORS relajado" en una línea con cuenta regresiva | US3-4, FR-013/024 |
| 11 | Añadir una entrada inválida a la lista de producción en disco (como en 003) y reiniciar el SW | Avisos en la franja, una línea cada uno con solución y "Cerrar"; con 3 o más, "N avisos" desplegable sin mover la lista | FR-013a |
| 12 | Panel a 320 px | Sin scroll horizontal; filtros en ≤ 2 filas; detalle debajo de la lista | SC-002, FR-008/009 |
| 13 | Recorrer todo solo con teclado | Secciones, filtros, lista, divisor, menús y diálogos operables; foco visible; Escape cierra menús y diálogos (anotar D2) | FR-031 |
| 14 | Prueba de comprensión: un dev que usa DevTools a diario, sin explicación, busca filtros, detalle, Ajustes y "Crear regla desde este request" | < 10 s cada uno; registrar tiempos en research.md | SC-005 |
