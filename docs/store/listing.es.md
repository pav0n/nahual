# Listing de la Chrome Web Store (español)

Texto para el Developer Dashboard (FR-043). Debe coincidir con [`permissions.md`](permissions.md),
[`privacy-policy.md`](privacy-policy.md) y [`data-practices.md`](data-practices.md).

## Nombre

Nahual

## Resumen (≤ 132 caracteres)

Intercepta, modifica y reenvía el tráfico HTTP de tu app desde DevTools. Reglas, CORS de desarrollo, hooks y exportación a código.

## Categoría

Herramientas para desarrolladores

## Descripción

Nahual es un panel de DevTools para desarrolladores frontend. Su único propósito es ayudarte a
inspeccionar y modificar el tráfico HTTP de la pestaña que estás depurando, sin salir del
navegador.

**Qué hace**

- Muestra el tráfico de la pestaña con el aspecto del panel Network.
- Reglas por sitio que pausan, simulan, fallan o retrasan solo los requests que cumplen una
  condición (status, header, query, JSONPath, GraphQL).
- CORS de desarrollo: explica por qué se bloqueó un request y, si lo pides, lo relaja solo en esa
  pestaña, solo para tus orígenes y con caducidad. Genera un reporte para el equipo de backend.
- Repeater y diff: reenvía un request editado y compara respuestas.
- Hooks en TypeScript: modifica requests y respuestas con tu código, aislado y con límite de
  tiempo.
- Exportar a código: cURL, fetch, test Vitest, handler MSW, schema Zod y colección de Postman, con
  los valores sensibles redactados por defecto.
- Perfiles de reglas por pestaña y configuración portable en JSON.

**Por qué pide cada permiso**

- **debugger**: Nahual usa el Chrome DevTools Protocol para ver y modificar el tráfico de la
  pestaña que inspeccionas. Solo se adjunta mientras el panel de Nahual está abierto en esa
  pestaña, y se suelta al cerrarlo.
- **storage**: guarda en tu navegador tus reglas, perfiles y ajustes. No guarda el tráfico.
- **Acceso a sitios (opcional)**: solo si usas el repeater en "contexto limpio", Nahual te pide
  acceso al origen exacto al que quieres enviar ese request. Puedes quitarlo cuando quieras en
  Ajustes.

**La barra amarilla**

Mientras Nahual está adjunto, Chrome muestra una barra amarilla que dice que "Nahual" está
depurando el navegador. Es la garantía de Chrome de que sabes cuándo una extensión usa el
debugger. Aparece solo con el panel de Nahual abierto y desaparece al soltarlo: con el botón de la
barra de Chrome, con "Soltar" en el estado de sesión de Nahual, con `Alt+Shift+A` o cerrando el
panel.

**Qué no hace**

- No necesita cuenta ni tiene servidores propios.
- No envía tu tráfico, tus reglas ni ningún dato a nadie. No hay telemetría.
- No ejecuta código remoto. Tus hooks corren en una página aislada, sin red ni acceso a la
  extensión.

Código abierto (Apache-2.0). Política de privacidad: ver el enlace del listing.
