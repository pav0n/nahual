# Nahual — 04 · Repeater + diff

> Feature `004-repeater-diff`. Depende de: `002-captura-intercept` (tráfico capturado y detalle).
> Objetivo: reproducir un bug reenviando requests y ver qué cambió entre respuestas.

## Contexto para el agente

Nahual es una extensión de Chrome MV3 (`chrome.debugger` + CDP) para devs frontend. La lista de tráfico y el detalle ya existen. El repeater envía requests de dos formas: dentro de la pestaña (con sus cookies y origen) vía `Runtime.evaluate`, o desde la extensión (contexto limpio, sin sesión).

---

## `/speckit.specify`

```text
Especifica el repeater y el diff de respuestas de Nahual.

P1 — Reenviar un request
Como dev, quiero reenviar un request capturado y editarlo, para reproducir un bug sin repetir el flujo en la UI.
Aceptación:
- Desde cualquier request capturado, "Enviar al repeater" abre una pestaña editable (método, URL, headers, body).
- Dos modos de envío: contexto de página (cookies y origen de la pestaña) y contexto limpio (sin sesión). El modo activo siempre es visible y el predeterminado es contexto de página.
- Cada envío queda en el historial de esa pestaña del repeater con status, tiempo y tamaño.
- Las pestañas del repeater se pueden renombrar, duplicar y cerrar (con deshacer).
- Atajo para enviar (Ctrl/Cmd + Enter).

P1 — Comparar respuestas
Como dev, quiero comparar dos respuestas, para ver qué cambió.
Aceptación:
- Diff entre dos respuestas cualesquiera: original vs reenviada, o dos envíos del historial.
- Muestra diferencias de status, headers y body JSON estructural (añadido, eliminado, cambiado) con ruta del campo; texto plano con diff por líneas.
- Campos volátiles (timestamps, trace ids) se pueden marcar para ignorar; la lista se recuerda por endpoint.
- Los headers sensibles aparecen redactados en el diff salvo acción explícita.
- Los cambios no dependen solo del color (íconos o prefijos +/−/~).

Casos límite: la pestaña inspeccionada navega o se cierra (el modo contexto de página se deshabilita con explicación); respuestas binarias o > 5 MB (solo metadatos en el diff); body JSON inválido (diff de texto); request que dispara un preflight CORS (se informa, y si hay relajación CORS activa en 003 se respeta).

Criterios de éxito:
- De request capturado a reenviado en menos de 10 segundos.
- El diff identifica correctamente el 100% de los cambios en la suite de casos de prueba.
```

## `/speckit.clarify` — preguntas sugeridas

1. ¿El historial del repeater persiste entre sesiones?
2. ¿Se necesita comparar contra un JSON pegado manualmente (ej. respuesta esperada)?

## `/speckit.plan`

```text
Planifica sobre 002.

packages/domain (TDD):
- RepeaterTab, RepeaterSend, DiffResult con schemas Zod.
- Diff JSON estructural (librería elegida en research.md de 001) con soporte de rutas ignoradas, y diff de texto por líneas.
- Normalización previa (orden de claves, headers en minúsculas).

apps/extension:
- Service worker: envío en contexto de página con Runtime.evaluate usando una PLANTILLA FIJA que recibe el request serializado como argumento (nunca concatenar datos del usuario como código); envío en contexto limpio con fetch desde el service worker.
- Captura de la respuesta del envío con los mismos límites de body.
- Panel: pestañas del repeater, editor de request, historial, vista de diff con navegación entre cambios y teclado.

Seguridad: plantilla fija en Runtime.evaluate con prueba que intente inyectar código vía URL, headers y body; redacción en el diff; el envío en contexto limpio no hereda cookies; ningún permiso nuevo.

Pruebas: unitarias del diff con casos de anidación, arrays, tipos cambiados y rutas ignoradas; E2E de reenvío en ambos modos; prueba de inyección; axe sobre el diff.
```

## `/speckit.tasks`

```text
Genera tasks.md por historia (P1 reenviar, P1 comparar).
TDD en packages/domain. [P] en lo paralelizable. Ruta de archivo en cada tarea.
Incluye prueba de inyección en Runtime.evaluate, E2E en ambos modos, revisión axe y checkpoint demostrable.
```
