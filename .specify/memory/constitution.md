# Nahual Constitution

> **Nahual** es una extensión de Chrome (Manifest V3) para desarrolladores frontend que intercepta,
> modifica y reenvía tráfico HTTP usando `chrome.debugger` y el Chrome DevTools Protocol (CDP):
> intercept condicional, CORS de desarrollo, repeater + diff, hooks en TypeScript y exportación
> al código.

## Core Principles

### I. Seguridad por defecto (NO NEGOCIABLE)

La extensión ve todo el tráfico de la pestaña, incluidas credenciales. Cada decisión de diseño
MUST evaluarse primero contra ese riesgo.

- **Local-first:** todas las funciones individuales (captura, intercept, CORS de desarrollo,
  repeater, diff, hooks, exportación) MUST funcionar 100% en el navegador, sin cuenta, sin
  backend y sin red propia.
- **Cloud opcional y explícito:** las funciones en la nube (planes de pago) MUST activarse solo
  al iniciar sesión y al elegir compartir algo concreto. Nunca se sube tráfico de forma
  automática ni en segundo plano.
- **Cifrado de lo compartido:** todo lo compartido (sesiones, reglas, hooks) MUST redactarse
  antes de salir del navegador y viajar cifrado de extremo a extremo; el servidor de Nahual no
  puede leer el contenido.
- **Telemetría:** apagada por defecto. Cualquier métrica MUST ser opt-in, anónima, documentada y
  nunca incluir URLs, headers ni bodies.
- **Mínimo privilegio:** solo permisos estrictamente necesarios. `<all_urls>` MUST ser opcional y
  solicitarse por dominio al activar una regla. Cada permiso nuevo MUST justificarse por escrito
  en el `plan.md` de la feature.
- **Sin código remoto:** todo el código va empaquetado (requisito MV3).
- **Sandbox de hooks:** el código del usuario MUST correr solo en una página declarada en
  `sandbox.pages`, sin acceso a `chrome.*`, a la red ni al DOM de la pestaña.
- **Mensajería validada:** todo mensaje entre contextos (service worker, panel, sandbox) MUST
  validarse con Zod en el receptor y verificar su remitente (`sender.id`, origen de
  `postMessage`). Un mensaje inválido se descarta y se registra. Nunca `targetOrigin "*"`.
- **Redacción:** headers y valores sensibles (`Authorization`, `Cookie`, `Set-Cookie`, tokens)
  MUST redactarse por defecto en exportaciones, diffs y logs.
- **Debugger acotado:** el debugger MUST estar adjunto solo mientras el panel de Nahual está
  abierto en esa pestaña.
- **CORS acotado:** relajar CORS es una ayuda de desarrollo, nunca un modo global: acotado a
  pestaña + origen de la app + origen de la API, desactivado por defecto, visible mientras está
  activo y con expiración automática. Nunca `Access-Control-Allow-Origin: *` junto con
  credenciales; nunca en orígenes marcados como producción.
- **Sin inyección de HTML:** prohibidos `innerHTML`, `dangerouslySetInnerHTML` y `eval` fuera del
  sandbox. El contenido capturado se muestra siempre como texto.

*Razón:* una herramienta que lee y altera tráfico autenticado solo es aceptable si su superficie
de ataque es mínima y verificable.

### II. Fallar de forma segura (NO NEGOCIABLE)

- Ante cualquier error (script que lanza, timeout, mensaje inválido, detach inesperado), el
  tráfico MUST continuar SIN modificar. Nahual nunca deja colgada ni rompe la página inspeccionada.
- Todo request pausado MUST tener un timeout visible; al vencer, continúa sin cambios y se registra.

*Razón:* un error de Nahual nunca debe convertirse en un bug de la app que el dev está depurando.

### III. Usabilidad para desarrolladores

- El flujo básico (capturar, pausar, editar, continuar) MUST aprenderse sin documentación.
- Estados vacíos, de carga y de error MUST explicar qué pasa y qué hacer; los mensajes de error
  dan causa y solución, nunca solo un código.
- Toda acción destructiva MUST poder deshacerse o pedir confirmación.
- Las acciones frecuentes MUST tener atajo de teclado; todo es operable solo con teclado.
- Accesibilidad WCAG 2.2 AA: contraste, foco visible, roles ARIA, sin depender solo del color.
- La UI MUST seguir el tema claro/oscuro de DevTools y funcionar a 320 px de ancho.
- Interfaz en español e inglés desde el inicio (`chrome.i18n`); sin textos hardcodeados.

### IV. Test-first (NO NEGOCIABLE)

- TDD obligatorio para la lógica de dominio: pruebas escritas y fallando antes de implementar.
- Pruebas de integración con un CDP simulado y E2E con Playwright cargando la extensión real.
- Las garantías de seguridad (sandbox, mensajería, redacción, aislamiento CORS, cero red propia)
  MUST tener pruebas automatizadas que intenten violarlas.
- Cobertura mínima del 85% en paquetes de dominio.

### V. Arquitectura en capas y dominio puro

- La lógica de dominio (reglas, condiciones, diff, CORS, exportadores, redacción) MUST ser
  TypeScript puro sin `chrome.*`, testeable en Node.
- Los adaptadores (CDP, storage, mensajería, `declarativeNetRequest`) MUST aislarse detrás de
  interfaces.
- La UI no habla con CDP; solo con el service worker por mensajes tipados.

### VI. Rendimiento como requisito

- Overhead p95 < 20 ms por request interceptado sin pausa; medido en cada feature que toque el
  camino del tráfico.
- Sin reglas activas, solo captura pasiva (`Network`); `Fetch` se habilita únicamente con los
  patrones de las reglas activas.
- Límites explícitos: body evaluable 5 MB, historial 2,000 entradas por pestaña.

### VII. Cadena de suministro

- Dependencias mínimas, versiones exactas y lockfile commiteado.
- Auditoría de dependencias en CI; ninguna dependencia nueva sin justificar en el `plan.md`.
- Builds reproducibles; el paquete publicado se genera solo desde CI, con SBOM. Las credenciales
  de publicación viven en un environment de GitHub con aprobación manual obligatoria.

### VIII. Modelo de producto: lo individual es gratis, lo colectivo se cobra

- El plan gratuito MUST ser un producto completo para un dev individual; nunca se degrada para
  empujar al pago.
- Se cobra por colaboración (bibliotecas de equipo, sesiones compartidas), automatización
  (monitor de contratos, mocks en CI, IA con key incluida) y gobierno (políticas centrales, SSO,
  auditoría, self-hosted).
- La seguridad nunca se cobra: redacción, sandbox de hooks, límites de CORS, timeouts y
  validación de mensajes están en todos los planes.
- El núcleo MUST NOT depender de módulos de pago. Las funciones cloud viven en paquetes separados
  (`packages/cloud-*`) detrás de interfaces, y la extensión funciona igual si no están presentes
  o el servidor no responde.
- Las funciones de pago se especifican como features propias (`007+`); nunca se mezclan en las
  specs 001–006.

## Modelo de amenazas

Todo `plan.md` MUST revisar el cambio contra esta tabla y añadir las amenazas nuevas que introduzca.

| Amenaza | Vector | Mitigación |
|---|---|---|
| Página maliciosa manipula la extensión | `postMessage` o eventos falsificados desde la página | La página nunca habla con la extensión; la captura entra por CDP. El sandbox valida el origen de cada mensaje |
| Hook o configuración importados con código malicioso | Archivo `.ts`/JSON de terceros | Sandbox sin red ni `chrome.*`; vista previa; importación desactivada por defecto; límite de tamaño |
| Fuga de credenciales | Exportar cURL/tests, compartir diffs, logs | Redacción por defecto; inclusión solo con acción explícita |
| Inyección en el repeater | Datos del usuario concatenados en `Runtime.evaluate` | Plantilla fija con argumentos serializados |
| XSS en el panel | Body renderizado como HTML | Solo texto o Monaco; CSP estricta |
| Dependencia comprometida | Paquete npm malicioso o typosquatting | Lockfile, versiones exactas, auditoría en CI, SBOM |
| Abuso del permiso `debugger` | Adjuntar sin que el usuario lo sepa | Solo con el panel abierto; indicador de estado; botón para soltar |
| Pérdida de control de la página | Hook lento, request pausado olvidado | Timeouts visibles; continuar sin cambios ante error |
| CORS relajado expone al usuario | Regla olvidada que permite leer respuestas con credenciales | Acotado a pestaña + orígenes; origen exacto; expiración; indicador; bloqueado en producción |
| CORS oculta un bug real | Funciona en local, falla en staging | Reporte para backend; aviso de que la relajación no existe fuera del navegador del dev |
| Fuga en sesiones compartidas (pago) | Link con tokens o datos de clientes | Redacción obligatoria; vista previa; cifrado E2E; links con expiración y revocables |
| Compromiso del servidor cloud (pago) | Acceso a base de datos o almacenamiento | El servidor solo guarda contenido cifrado sin las llaves; el núcleo local sigue sin él |
| Biblioteca de equipo envenenada (pago) | Cuenta comprometida publica un hook malicioso | Hooks del equipo desactivados por defecto, vista previa, autor visible, historial, aprobación de admin |
| Escalada entre organizaciones (pago) | Acceso a datos de otra organización | Aislamiento por organización en cada consulta, pruebas de autorización en CI, auditoría |

## Flujo de desarrollo y puertas de calidad

- **Stack base:** TypeScript strict, monorepo pnpm + Turborepo, React, Vite, Vitest, Playwright,
  Zod, ESLint + Prettier.
- **Features:** una feature de Spec Kit por archivo de entrada en `docs/speckit-inputs/`
  (`001-spike-cdp` … `006-export-publicacion`), en el orden de dependencias documentado. Se cierra
  una feature (merge + checkpoint) antes de empezar la siguiente.
- **PRs:** cada feature produce un PR de especificación (spec, clarify, plan, tasks) y uno de
  implementación. PRs pequeños, Conventional Commits, merge solo con CI en verde y aprobación
  humana.
- **CI obligatorio:** lint, typecheck, pruebas, auditoría de dependencias y build reproducible.
- **Definición de terminado (por historia):**
  - Pruebas unitarias, de integración y E2E en verde.
  - Sin violaciones serias o críticas de axe.
  - Presupuesto de rendimiento verificado cuando aplica.
  - Textos en `es` y `en`.
  - Estados vacío, carga y error diseñados.
  - Revisión de seguridad contra el modelo de amenazas.
  - Ningún permiso ni dependencia nueva sin justificación en `plan.md`.

## Governance

- Esta constitución prevalece sobre cualquier otra práctica, guía o preferencia de herramienta.
- El "Constitution Check" de cada `plan.md` MUST verificar los principios I–VIII; cualquier
  desviación se documenta en la tabla de complejidad con su justificación y la alternativa
  más simple rechazada.
- Enmiendas: se proponen en un PR que modifica solo este archivo, con el motivo, el impacto en
  features existentes y, si aplica, un plan de migración. Requieren aprobación del mantenedor.
- Versionado semántico: MAJOR para eliminar o redefinir principios; MINOR para añadir principios
  o ampliar materialmente una guía; PATCH para aclaraciones y redacción.
- Cumplimiento: toda revisión de PR verifica la constitución; los principios marcados NO
  NEGOCIABLE no admiten excepciones.

**Version**: 1.0.0 | **Ratified**: 2026-10-22 | **Last Amended**: 2026-10-22
