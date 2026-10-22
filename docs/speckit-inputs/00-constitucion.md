# Nahual — 00 · Constitución y guía de uso

> **Nahual**: en la tradición mesoamericana, el ser que cambia de forma. La extensión transforma el tráfico HTTP sin que la app lo note.
> Extensión de Chrome (Manifest V3) para desarrolladores frontend: intercept condicional, CORS de desarrollo, repeater + diff, hooks en TypeScript y exportación al código. Construida sobre `chrome.debugger` + Chrome DevTools Protocol (CDP).

## Cómo usar este paquete

Cada archivo es **autocontenido** y corresponde a una feature de Spec Kit. Así el agente solo carga el contexto de lo que está construyendo.

| Archivo | Feature Spec Kit | Depende de |
|---|---|---|
| `00-constitucion.md` | `/speckit.constitution` (una sola vez) | — |
| `01-spike-cdp.md` | `001-spike-cdp` | 00 |
| `02-captura-intercept.md` | `002-captura-intercept` | 01 |
| `03-cors-desarrollo.md` | `003-cors-desarrollo` | 02 |
| `04-repeater-diff.md` | `004-repeater-diff` | 02 |
| `05-hooks-typescript.md` | `005-hooks-typescript` | 02 |
| `06-export-publicacion.md` | `006-export-publicacion` | 03, 04, 05 |

Flujo por archivo: `/speckit.specify` → `/speckit.clarify` → `/speckit.plan` → `/speckit.tasks` → `/speckit.analyze` → `/speckit.implement`. Cierra una feature (merge + checkpoint) antes de empezar la siguiente. 04 y 05 se pueden hacer en cualquier orden.

Pasos iniciales:

```bash
specify init nahual --ai claude
```

Luego ejecuta `/speckit.constitution` con el prompt de abajo. Los comandos son los de GitHub Spec Kit (`/speckit.*`); si tu versión usa otros nombres, ajústalos.

---

## `/speckit.constitution`

```text
Crea la constitución del proyecto Nahual, una extensión de Chrome MV3 para desarrolladores frontend que intercepta, modifica y reenvía tráfico HTTP usando chrome.debugger y CDP. Usa estos principios como no negociables:

I. Seguridad por defecto (NO NEGOCIABLE)
- La extensión ve todo el tráfico de la pestaña, incluidas credenciales. Cada decisión se evalúa primero contra ese riesgo.
- Núcleo local-first: todas las funciones individuales (captura, intercept, CORS de desarrollo, repeater, diff, hooks, exportación) funcionan 100% en el navegador, sin cuenta, sin backend y sin red propia.
- Las funciones en la nube (planes de pago) son opcionales y explícitas: se activan solo al iniciar sesión y al elegir compartir algo concreto. Nunca se sube tráfico de forma automática ni en segundo plano.
- Todo lo compartido (sesiones, reglas, hooks) se redacta antes de salir del navegador y viaja cifrado de extremo a extremo: el servidor de Nahual no puede leer el contenido.
- Cero telemetría por defecto. Cualquier métrica de uso es opt-in, anónima, documentada y nunca incluye URLs, headers ni bodies.
- Mínimo privilegio: solo los permisos estrictamente necesarios; <all_urls> es opcional y se pide por dominio cuando el usuario activa una regla. Cada permiso nuevo se justifica por escrito en el plan.
- Nunca se ejecuta código remoto. Todo el código de la extensión va empaquetado (requisito MV3).
- El código del usuario (hooks) solo corre en una página sandbox sin acceso a chrome.*, a la red ni al DOM de la pestaña.
- Todo mensaje entre contextos (service worker, panel, sandbox) se valida con Zod en el receptor y se verifica su remitente. Un mensaje inválido se descarta y se registra.
- Headers y valores sensibles (Authorization, Cookie, Set-Cookie, tokens) se redactan por defecto en exportaciones, diffs y logs.
- El debugger solo está adjunto mientras el panel de Nahual está abierto en esa pestaña.
- Relajar CORS es una ayuda de desarrollo, nunca un modo global: acotado a pestaña + origen de la app + origen de la API, desactivado por defecto, visible mientras está activo y con expiración automática. Nunca Access-Control-Allow-Origin "*" junto con credenciales.
- Sin innerHTML, dangerouslySetInnerHTML ni eval fuera del sandbox. El contenido capturado se muestra siempre como texto.

II. Fallar de forma segura
- Ante cualquier error (script que lanza, timeout, mensaje inválido, detach inesperado), el tráfico continúa SIN modificar. Nahual nunca deja colgada ni rompe la página inspeccionada.
- Todo request pausado tiene timeout visible; al vencer, continúa sin cambios.

III. Usabilidad para desarrolladores
- El flujo básico (capturar, pausar, editar, continuar) se aprende sin documentación.
- Estados vacíos, de carga y de error siempre explican qué pasa y qué hacer.
- Toda acción destructiva se puede deshacer o pide confirmación.
- Atajos de teclado para las acciones frecuentes; todo es operable solo con teclado.
- Accesibilidad WCAG 2.2 AA: contraste, foco visible, roles ARIA, sin depender solo del color.
- Sigue el tema claro/oscuro de DevTools y funciona a 320 px de ancho.
- Interfaz en español e inglés (i18n desde el inicio, sin textos hardcodeados).

IV. Test-first
- TDD obligatorio para la lógica de dominio: pruebas escritas y fallando antes de implementar.
- Pruebas de integración con un CDP simulado y E2E con Playwright cargando la extensión real.
- Cobertura mínima del 85% en paquetes de dominio.

V. Arquitectura en capas y dominio puro
- La lógica de dominio es TypeScript puro sin chrome.*, testeable en Node.
- Los adaptadores (CDP, storage, mensajería, declarativeNetRequest) se aíslan detrás de interfaces.
- La UI no habla con CDP; solo con el service worker por mensajes tipados.

VI. Rendimiento como requisito
- Overhead p95 < 20 ms por request interceptado sin pausa.
- Sin reglas activas, solo captura pasiva (Network); Fetch se habilita únicamente con los patrones de las reglas activas.
- Límites explícitos: body evaluable 5 MB, historial 2,000 entradas por pestaña.

VII. Cadena de suministro
- Dependencias mínimas, versiones exactas y lockfile commiteado.
- Auditoría de dependencias en CI; ninguna dependencia nueva sin justificar en el plan.
- Builds reproducibles; el paquete publicado se genera solo desde CI, con SBOM.

VIII. Modelo de producto: lo individual es gratis, lo colectivo se cobra
- El plan gratuito es un producto completo para un dev individual; nunca se degrada para empujar al pago.
- Se cobra por colaboración (bibliotecas de equipo, sesiones compartidas), automatización (monitor de contratos, mocks en CI, IA con key incluida) y gobierno (políticas centrales, SSO, auditoría, self-hosted).
- La seguridad nunca se cobra: redacción, sandbox de hooks, límites de CORS, timeouts y validación de mensajes están en todos los planes.
- Separación en el código: el núcleo no depende de módulos de pago. Las funciones cloud viven en paquetes separados (ej. packages/cloud-*) detrás de interfaces, y la extensión funciona igual si no están presentes o el servidor no responde.
- Las funciones de pago se especifican como features propias con su propia spec; nunca se mezclan en las specs 001–006.

Estándares de código: TypeScript strict, ESLint + Prettier, Conventional Commits, PRs pequeños con pruebas. Gobernanza: la constitución prevalece sobre cualquier otra práctica; cambiarla requiere documentar el motivo y su impacto.
```

---

## Anexo A — Modelo de amenazas (referencia para todos los planes)

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
| Fuga en sesiones compartidas (pago) | Link de sesión con tokens o datos de clientes | Redacción obligatoria antes de subir; vista previa de lo que se comparte; cifrado de extremo a extremo; links con expiración y revocables |
| Compromiso del servidor cloud (pago) | Atacante accede a la base de datos o al almacenamiento | El servidor solo guarda contenido cifrado sin las llaves; el núcleo local sigue funcionando sin él |
| Biblioteca de equipo envenenada (pago) | Un miembro o cuenta comprometida publica un hook malicioso | Hooks del equipo desactivados por defecto en cada máquina, con vista previa y autor visible; historial de versiones; política de admin para aprobar hooks |
| Escalada de privilegios entre organizaciones (pago) | Acceso a reglas o sesiones de otra organización | Aislamiento por organización en cada consulta, pruebas de autorización en CI, auditoría de accesos |

## Anexo B — Funciones de pago (después de 001–006)

Las funciones de pago se especifican como features propias de Spec Kit (`007+`) y se gestionan
fuera de este repositorio. El núcleo publicado aquí no depende de ellas (principio VIII).

## Anexo C — Definición de terminado (por historia)

- [ ] Pruebas unitarias, de integración y E2E en verde.
- [ ] Sin violaciones serias o críticas de axe.
- [ ] Presupuesto de rendimiento verificado.
- [ ] Textos en `es` y `en`.
- [ ] Estados vacío, carga y error diseñados.
- [ ] Revisión de seguridad contra el modelo de amenazas.
- [ ] Ningún permiso ni dependencia nueva sin justificación en `plan.md`.
