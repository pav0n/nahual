# Contrato: interfaz de los hooks en el panel (006)

**Regla**: cada pieza nueva sigue a su equivalente de DevTools (R13) y se arma con los
componentes de 004 (`Toolbar`, `IconButton`, `Tabs`, `TabPanel`, `Drawer`, `Dialog`, patrón
`.detail`, tokens `--nh-*`). Nada de botones con borde sueltos, filas de botones de texto ni
estilos propios fuera de los tokens: la revisión de 005 mostró que eso rompe la integración.
Todo texto en `es`/`en`; 320 px sin scroll horizontal; axe sin violaciones serias en ambos
temas; capturas de regresión visual a 320, 800 y 1280 px.

## Puntos de extensión de 004 que se usan

| Punto | Qué se registra |
|---|---|
| `RULE_EDITOR_SLOTS` | El editor de código del hook (contenido ancho) |
| `DRAWER_SLOT` | La consola de hooks, con nombre "Consola de hooks" |
| `STATUS_ITEMS` | El contador de errores de hooks |
| `DETAIL_TABS` | La pestaña `hooks` del detalle de Tráfico |

## Editor de reglas: acción "Modificar con hook"

- El selector de acción de 002 suma "Modificar con hook". Al elegirla:
  - **Barra** (`Toolbar`, como la de Sources sobre el editor): menú "Plantillas" (`Menu` de 004),
    `IconButton` "Importar hook…", "Exportar hook", "Descargar tipos"; a la derecha, el uso
    ("Hooks: 12 KB de 5 MB") en gris.
  - **Editor** (contenido ancho): CodeMirror con el aspecto del editor de Sources: fuente y
    tamaño monoespaciados de DevTools, números de línea en el margen con su color, línea activa
    resaltada, colores de sintaxis de DevTools en claro y oscuro (tokens nuevos
    `--nh-syntax-keyword`, `-string`, `-number`, `-comment`, `-property`, `-type`, tomados del
    tema de DevTools), subrayado ondulado y marca en el margen para errores y avisos, caja de
    sugerencias y descripción con el estilo de la de Sources.
  - **Ayuda** debajo, en gris: "Tab inserta una tabulación. Pulsa Esc y luego Tab para salir
    del editor. Cada hook tiene 2 s para terminar."
  - **Problemas**: debajo del editor, lista compacta "Línea 4: …" (como el panel de problemas),
    con `aria-live` que resume el total.
  - **Permisos**: dos casillas como las de Ajustes de DevTools, cada una con su explicación en
    gris: "Este hook puede cambiar el destino del request" y "Este hook puede leer valores
    sensibles". Desmarcadas por defecto.
  - **Interruptor de la regla**: deshabilitado con el motivo al lado si hay errores (FR-016).
- Una regla importada muestra la etiqueta "importado" en la lista y en el editor.
- Una regla suspendida muestra "suspendido" en la lista, con el motivo como texto y la acción
  "Reanudar".

## Vista previa al importar (`Dialog`)

- Título "Importar hook"; configuración que se creará como lista de definición (etapa, prefiltro,
  tipos, condiciones) o el aviso "El archivo no trae configuración: se importará solo el código"
  con el motivo.
- Código completo en un bloque de solo lectura con números de línea, con el aspecto de Sources
  (sin cargar el editor; `pre` con el texto).
- Aviso: "Se guardará desactivado. Revisa el código antes de activarlo."
- Botones: "Importar" (primario) y "Cancelar".

## Consola de hooks (cajón, como Console de DevTools)

- **Barra** (`Toolbar`): `IconButton` "Limpiar consola" (icono `clear` de Console), campo
  "Filtrar", botones de selección "Registros" y "Errores" (como los niveles de Console), menú de
  regla, `ToggleButton` "Mostrar valores sensibles" (FR-030) y a la derecha "Vaciar estado".
  "Limpiar consola" y "Vaciar estado" muestran el aviso de 004 con "Deshacer" durante 10 s.
- **Valores redactados**: dentro del texto, `••••••` con la etiqueta "redactado" como en el diff de
  005, hasta pulsar "Mostrar valores sensibles".
- **Filas**: una por entrada, con el formato de Console: icono de nivel (error: círculo rojo con
  ×, como Console), texto monoespaciado, fondo y color de error del tema
  (`--nh-console-error-bg`, `--nh-console-error-text`), burbuja con el número de repeticiones a la
  izquierda del texto, y a la derecha el enlace "Nombre de regla · GET /ruta" que abre el request
  en Tráfico (como `archivo:línea`). La hora en gris al pasar el foco o el puntero, como con
  "Mostrar marcas de tiempo".
- **Vacía**: "Los registros y errores de tus hooks aparecerán aquí." con una línea sobre `log()`.
- Las filas son una lista navegable con flechas; Enter abre el request.

## Contador de errores (barra superior)

- Como el contador de errores de DevTools: icono de error rojo + número, sin texto extra; nombre
  accesible "N errores de hooks sin leer". Solo aparece con errores sin leer.
- Un clic abre el cajón en la consola filtrada a errores y los marca leídos.

## Pestaña Hooks del detalle

- Tabla compacta como la de Timing: una fila por ejecución con regla, resultado (texto + icono,
  nunca solo color), duración y partes cambiadas ("status, body"); si cambió el destino,
  "Destino: original → nuevo". Debajo de cada fila, sus registros como en Console. Al final,
  "Cadena: 3 hooks, 14 ms".
- Errores con tipo, mensaje y "Línea N", y la acción "Abrir regla". El de tiempo agotado dice
  "Superó el límite de 2 s".

## Avisos

- Suspensión: toast de 004 "El hook «X» se suspendió tras 5 errores seguidos." con "Reanudar".
- Importación rechazada o límite de 5 MB: el mensaje del error en la barra del editor, con el uso.

## Atajos

Sin atajos nuevos globales: Esc ya controla el cajón en DevTools y 004 no lo intercepta. En el
editor, los de CodeMirror (deshacer, buscar) y `Ctrl/Cmd+S` guarda la regla, como en Sources.
