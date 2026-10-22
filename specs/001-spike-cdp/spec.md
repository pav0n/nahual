# Feature Specification: Spike CDP y base del proyecto

**Feature Branch**: `001-spike-cdp`

**Created**: 2026-10-22

**Status**: Draft

**Input**: User description: "usa docs/speckit-inputs/01-spike-cdp.md" — Spike técnico y base del proyecto Nahual: validar que se puede adjuntar el debugger a una pestaña, pausar y continuar requests y responses de forma estable, y documentar las decisiones de arquitectura con datos. Fuera de alcance: UI final, reglas persistentes y cualquier función para el usuario final.

## Clarifications

### Session 2026-10-22

- Q: ¿Con qué licencia se publicará el código de Nahual? → A: Apache-2.0.
- Q: ¿El panel mínimo del spike debe vivir solo dentro de DevTools, o también en el side panel
  de Chrome? → A: Solo panel de DevTools en este spike.
- Q: ¿Qué app real se usará como banco de pruebas para la hora de uso continuo y la medición
  de overhead? → A: Una app propia del equipo (SPA + API en otro origen) en local o staging.
- Q: ¿Cuánto tiempo puede estar pausado un request antes de que Nahual lo continúe solo, sin
  cambios? → A: Configurable en el panel, 30 s por defecto.

## User Scenarios & Testing *(mandatory)*

> Esta feature no entrega funciones al usuario final. Sus "usuarios" son el equipo de desarrollo
> de Nahual, y su valor es reducir los riesgos técnicos más altos antes de construir las features
> 002–006 sobre una base estable.

### User Story 1 - Validar el ciclo adjuntar → pausar → continuar → soltar (Priority: P1)

Como equipo de desarrollo, queremos adjuntar el debugger a una pestaña desde un panel mínimo de
DevTools, pausar requests y responses que coincidan con un patrón de URL, continuarlos sin cambios
o con un header modificado, y soltar el debugger, todo de forma estable, para decidir la
arquitectura con datos y no con suposiciones.

**Why this priority**: es el riesgo técnico central del producto. Si este ciclo no es estable, el
resto de features (intercept condicional, CORS de desarrollo, repeater, hooks) no son viables tal
como están planteadas.

**Independent Test**: con la extensión cargada en Chrome y una página de prueba abierta, se abre
el panel de Nahual, se adjunta el debugger, se configura un patrón de URL, se provocan requests
que coinciden y se verifica en la página y en el panel que cada uno se pausa, se continúa (sin
cambios y con un header modificado) y que al soltar el debugger la página sigue funcionando.

**Acceptance Scenarios**:

1. **Given** el panel de Nahual abierto en una pestaña sin debugger, **When** el dev pulsa
   "Adjuntar", **Then** el debugger queda adjunto a la pestaña inspeccionada y el panel muestra
   el estado "adjunto".
2. **Given** el debugger adjunto, **When** el dev pulsa "Soltar", **Then** el debugger se
   desprende, la barra de aviso de Chrome desaparece y el panel muestra el estado "desconectado".
3. **Given** el debugger adjunto y un patrón de URL configurado para la etapa Request, **When** la
   página emite un request que coincide, **Then** el request queda pausado, el panel lo lista y
   el dev puede continuarlo sin cambios; la página recibe la respuesta normal.
4. **Given** un request pausado en etapa Request, **When** el dev añade o modifica un header y
   continúa, **Then** el servidor recibe el request con el header modificado.
5. **Given** un patrón de URL configurado para la etapa Response, **When** llega la respuesta de
   un request que coincide, **Then** la respuesta queda pausada, el panel muestra su estado y
   headers, y el dev puede continuarla sin cambios o con un header modificado; la página recibe
   la respuesta con el cambio aplicado.
6. **Given** el panel de Nahual abierto (y por tanto DevTools abiertas), **When** otro cliente de
   debugger (p. ej. otra extensión) ya está adjunto o se adjunta a la pestaña, una función de
   DevTools que también intercepta (Local Overrides, bloqueo de requests) entra en conflicto, o
   el debugger se suelta por cualquier causa externa, **Then** el panel detecta la situación,
   muestra el estado "en conflicto" o "desconectado" con la causa, y ofrece un botón para
   reconectar.
7. **Given** un request pausado, **When** el proceso en segundo plano de la extensión se reinicia,
   **Then** al volver a arrancar no quedan sesiones de debugger huérfanas ni requests sin
   resolver, y la página no queda colgada.
8. **Given** el panel de Nahual cerrado en una pestaña, **When** se cierra el panel con el
   debugger adjunto, **Then** el debugger se suelta automáticamente.

---

### Entregables de investigación (parte de la misma historia)

Además del ciclo funcional, la historia se considera terminada solo si existe un documento de
investigación (`research.md`) con resultados medidos y decisiones razonadas sobre:

1. **Preflight CORS**: si los requests OPTIONS son interceptables en el mecanismo de pausa, y si
   modificar los headers `Access-Control-*` en etapa Response basta para que Chrome acepte la
   respuesta. Incluye la estrategia CORS recomendada para la feature correspondiente.
2. **Comportamiento con DevTools nativas abiertas**: qué combinaciones conviven y cuáles provocan
   conflicto o desconexión.
3. **Overhead**: p50 y p95 del tiempo añadido por interceptar sin pausar, medido sobre una app
   real, y comparación con el presupuesto de la constitución.
4. **Decisiones de herramientas**: transpilador de hooks (esbuild-wasm vs Sucrase), plugin de
   build para la extensión, librería de JSONPath y librería de diff JSON, cada una con criterios,
   alternativas evaluadas y motivo de la elección.

### Edge Cases

- **Redirecciones**: un request pausado en etapa Response que resulta ser una redirección no
  tiene body disponible; el panel lo indica y la continuación funciona igual.
- **Timeout de pausa**: si el dev no actúa sobre un request pausado, al vencer el timeout se
  continúa sin cambios, se registra el evento y el panel lo muestra.
- **Timeout fuera de rango**: un valor menor que 5 s o mayor que 120 s se rechaza con un mensaje
  que indica el rango válido, y se conserva el valor anterior.
- **Error interno**: si falla la modificación de un header (valor inválido, error del protocolo),
  el request continúa sin modificar y el panel muestra el error con causa.
- **Pestaña cerrada o navegada** con requests pausados: no quedan sesiones ni pausas pendientes;
  una pausa cuyo request canceló la navegación se resuelve como abandonada a más tardar al
  vencer su timeout.
- **Varias pestañas**: adjuntar en una pestaña no afecta a otras; cada pestaña tiene su propio
  estado.
- **Páginas restringidas** (p. ej. páginas internas del navegador o de la tienda de extensiones):
  el adjunto falla y el panel explica por qué.
- **Mensaje inválido o de remitente desconocido** entre el panel y el proceso en segundo plano:
  se descarta y se registra, sin afectar al tráfico.
- **Patrón de URL vacío o inválido**: no se pausa nada y el panel lo indica.

## Requirements *(mandatory)*

### Functional Requirements

**Ciclo del debugger**

- **FR-001**: El panel, que vive únicamente dentro de DevTools, MUST permitir adjuntar y soltar
  el debugger de la pestaña inspeccionada.
- **FR-002**: El panel MUST mostrar en todo momento el estado de la conexión: "adjunto",
  "desconectado" o "en conflicto", con la causa cuando no está adjunto.
- **FR-003**: El sistema MUST detectar cualquier desconexión o conflicto externo del debugger
  (otro cliente de debugger en la pestaña, funciones de DevTools que interfieren, cierre de la
  pestaña, acción del usuario en la barra de aviso) y el panel MUST ofrecer
  reconectar mediante una acción explícita; la reconexión nunca es automática.
- **FR-004**: El debugger MUST estar adjunto solo mientras el panel de Nahual está abierto en esa
  pestaña; al cerrarse el panel, se suelta.
- **FR-005**: Al arrancar (incluido tras un reinicio inesperado), el sistema MUST liberar toda
  sesión de debugger que hubiera quedado de una ejecución anterior y garantizar que ningún
  request queda pausado sin resolver.

**Intercepción mínima**

- **FR-006**: El dev MUST poder configurar en el panel al menos un patrón de URL y la etapa
  (Request o Response) en que se pausa. La configuración es de sesión y no persiste.
- **FR-007**: Sin patrón configurado, el sistema MUST NOT pausar ni interceptar requests.
- **FR-008**: El panel MUST listar los requests pausados con URL, método, etapa y headers.
- **FR-009**: El dev MUST poder continuar un request o response pausado sin cambios.
- **FR-010**: El dev MUST poder continuar un request o response pausado con al menos un header
  añadido o modificado.
- **FR-011**: Todo request pausado MUST tener un timeout visible (cuenta regresiva en el panel);
  al vencer, continúa sin cambios y se registra. El timeout es de 30 s por defecto y el dev MUST
  poder cambiarlo en el panel entre 5 y 120 s; el valor aplica a las pausas nuevas, es de sesión
  y no persiste.
- **FR-012**: Ante cualquier error de Nahual durante una pausa, el tráfico MUST continuar sin
  modificar.

**Seguridad y base del proyecto**

- **FR-013**: Todo mensaje entre el panel y el proceso en segundo plano MUST validarse en el
  receptor (forma, tipo, versión) y verificar que proviene de la propia extensión; los mensajes
  inválidos se descartan y se registran.
- **FR-014**: La extensión MUST solicitar solo los permisos imprescindibles para este spike; el
  acceso a hosts MUST ser opcional.
- **FR-015**: La extensión MUST NOT realizar tráfico de red propio ni ejecutar código remoto o
  evaluado dinámicamente.
- **FR-016**: Todo texto visible del panel MUST estar disponible en español e inglés.
- **FR-016a**: El panel MUST cumplir el principio III de la constitución aunque sea mínimo:
  operable solo con teclado con foco visible, atajos para Adjuntar/Soltar y para Continuar la
  pausa seleccionada (mostrados en el panel), sin violaciones serias o críticas de axe
  (WCAG 2.2 AA), siguiendo el tema claro/oscuro de DevTools y usable a 320 px de ancho, con
  estados vacío, carga y error que explican qué pasa y qué hacer.
- **FR-017**: El contenido capturado (URLs, headers) MUST mostrarse como texto, nunca
  interpretado como HTML.
- **FR-018**: El proyecto MUST quedar con la estructura base (lógica de dominio separada,
  contratos de mensajes compartidos, extensión) y con verificación automática de lint, tipos,
  pruebas, auditoría de dependencias y build reproducible en cada cambio.
- **FR-018a**: El repositorio MUST incluir la licencia Apache-2.0, y toda dependencia elegida
  (incluidas las de las decisiones de herramientas) MUST tener una licencia compatible con ella;
  la licencia de cada candidata se registra en `research.md`.

**Investigación**

- **FR-019**: El equipo MUST producir `research.md` con los cuatro entregables de investigación
  descritos arriba, cada uno con método, resultado medido u observado, decisión y alternativas
  descartadas.
- **FR-020**: La medición de overhead MUST hacerse sobre la app propia del banco de pruebas
  (SPA + API en otro origen, en local o staging) con intercepción activa sin pausa, reportando p50 y p95 sobre una muestra de al menos 500 requests.

### Key Entities

- **Sesión de debugger**: vínculo entre Nahual y una pestaña. Atributos: pestaña, estado
  (adjunto, desconectado, en conflicto), causa de la última desconexión, momento de adjunto.
- **Patrón de intercepción**: patrón de URL + etapa (Request/Response). Solo vive durante la
  sesión del panel.
- **Configuración de sesión**: timeout de pausa (30 s por defecto, 5–120 s). Solo vive durante
  la sesión del panel.
- **Request pausado**: request o response detenido a la espera de una decisión. Atributos:
  identificador, URL, método, etapa, headers, estado HTTP (en Response), indicador de body
  disponible, momento de pausa y vencimiento del timeout.
- **Mensaje entre contextos**: unidad de comunicación panel ↔ proceso en segundo plano, con tipo,
  versión e identificador de correlación.
- **Registro de investigación**: resultado de un experimento o decisión, con método, datos,
  conclusión y alternativas.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001** (criterio de salida): 1 hora de uso continuo sobre una app real con adjuntar,
  pausar, continuar y soltar repetidos termina con 0 sesiones de debugger huérfanas y 0 requests
  sin resolver.
- **SC-002**: el 100% de las desconexiones y conflictos externos provocados en pruebas (otro
  cliente de debugger, cierre de pestaña y, verificada a mano por no ser automatizable,
  cancelación desde la barra de aviso) se reflejan en el panel en menos de
  1 segundo y la reconexión funciona al primer intento.
- **SC-003**: tras forzar un reinicio del proceso en segundo plano con un request pausado, la
  página recibe su respuesta (sin cambios) en menos de 5 segundos y no queda ninguna sesión
  activa sin panel.
- **SC-004**: el overhead de interceptar sin pausar es medido y reportado; el p95 queda por
  debajo de 20 ms por request, o `research.md` documenta la desviación y su plan de mitigación.
- **SC-005**: `research.md` contiene una decisión justificada para cada uno de los 4 entregables
  de investigación (estrategia CORS, DevTools nativas, overhead, y las 4 decisiones de
  herramientas).
- **SC-006**: un dev del equipo que no participó en el spike completa el ciclo adjuntar → pausar
  → modificar header → continuar → soltar sin ayuda en menos de 3 minutos.
- **SC-007**: la verificación automática (lint, tipos, pruebas, auditoría, build) pasa en verde
  en el cambio de implementación, incluida una prueba de punta a punta del ciclo completo y una
  prueba de robustez del reinicio con un request pausado.

## Assumptions

- El panel vive solo en DevTools para esta feature; el side panel de Chrome queda fuera de
  alcance y no se investiga en este spike.
- La app real del banco de pruebas es una app propia del equipo: una SPA con tráfico
  autenticado y una API en otro origen (para probar preflight CORS), corriendo en local o
  staging, nunca en producción. La app concreta y su versión se registran en `research.md` para
  que las mediciones sean reproducibles.
- El proyecto se publica bajo Apache-2.0. No se reutiliza código de terceros con licencia
  copyleft (p. ej. Requestly, AGPLv3); solo se consulta como referencia de comportamiento.
- El rango permitido del timeout (5–120 s) evita pausas tan cortas que no dejen editar y tan
  largas que la página dispare sus propios timeouts; la política definitiva se revisa en la
  feature de intercept condicional.
- La configuración de patrones es efímera (sin almacenamiento); las reglas persistentes son
  alcance de otra feature.
- La barra amarilla de aviso de Chrome al adjuntar el debugger es aceptada y no se intenta
  ocultar; se considera parte del modelo de transparencia hacia el usuario.
- El body no está disponible en redirecciones por limitación de la plataforma; se documenta, no
  se intenta sortear.
- La UI del panel es mínima en funciones (sin diseño visual final), pero cumple la definición
  de terminado de la constitución en accesibilidad, teclado, tema, 320 px, estados e i18n
  (FR-016a).
- Depende únicamente de la constitución v1.0.0; no hay features previas.
