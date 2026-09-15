# Pulido 2026-09 — lista de trabajo

Estado: `pendiente` · `hecho` · `no aplica` · `bloqueado`. Cada punto lleva su criterio de aceptación.
Los hallazgos vienen de leer el código, no de suponer.

## P0 · Seguridad y aislamiento

| # | Hallazgo | Estado | Criterio de aceptación |
|---|---|---|---|
| S1 | `/api/ai/*` acepta peticiones sin `Origin`, así que cualquiera con `curl` gasta la llave Groq del despliegue. | hecho | Sin cabeceras de navegador la ruta responde 403. Hay presupuesto por IP y tope de `max_tokens`. El límite real está documentado, no disfrazado. |
| S2 | `/api/mcp` y `/api/oauth` devuelven `Access-Control-Allow-Origin` a cualquier origen: son proxies abiertos a cualquier destino https. | hecho | Solo atienden al propio sitio; desde otro origen, 403. |
| S3 | Sin coordinación entre pestañas: cambiar de usuario en una deja a la otra con la base del usuario anterior y el sufijo de claves del nuevo (incluidos tokens de OneDrive). | hecho | La sesión se fija al cargar. Si otra pestaña cambia de usuario o cierra sesión, esta se bloquea y ofrece recargar; no escribe nada más. |
| S4 | Sin sesión, `db` apunta a `mesa`, la base del primer usuario. | hecho | Sin sesión la base es inerte y ningún módulo puede leer datos de nadie. |
| S5 | La preferencia de autonomía solo cambia el texto del prompt; nada la aplica. Las reglas de confirmación viven únicamente en el prompt. | hecho | Con «pregunta antes», una acción destructiva pedida a Sky se detiene y pide confirmación en la interfaz. En lote grande, también. Se cumple aunque el modelo ignore el prompt. |
| S6 | El contenido de documentos y páginas entra al modelo sin marcarse como no confiable. | hecho | El prompt lo declara datos, y el código no depende de esa declaración: las acciones sensibles pasan por la puerta de S5. |
| S7 | `HtmlSandbox` aísla origen pero permite red saliente; el navegador integrado no restringe la página enmarcada. | hecho | El HTML generado no puede hacer peticiones externas. La página enmarcada no puede navegar la ventana principal. |
| S8 | El PIN y las bases con nombres distintos se pueden leer como si fueran una frontera de seguridad. | hecho | `SECURITY.md` dice qué protege y qué no. Ningún texto del producto promete más. |

## P1 · Continuidad, reversión y proyecto

| # | Punto | Estado | Criterio de aceptación |
|---|---|---|---|
| C1 | Ventanas y escritorio por usuario tras recargar. | hecho | Vuelven encajadas en la pantalla actual, sin lo que ya no existe. |
| C2 | Deshacer con inversos serializables que sobreviven la recarga. | hecho | Deshacer lo de ayer funciona; lo irreversible no ofrece botón. |
| C3 | Acciones externas marcadas y visibles. | hecho | «En la app» en la conversación y en el historial. |
| C4 | Proyecto: objetivo, decisiones, pendientes, bitácora. | hecho | Vive en `Proyecto.md` dentro de la carpeta; editable a mano. |
| C5 | Conversación propia por proyecto. | hecho | Dos proyectos conservan hilos separados; cambiar de proyecto cambia el contexto y el panel dice en cuál estás. |
| C6 | Memoria corregible desde la interfaz. | hecho | El objetivo se edita desde la franja; el archivo completo se abre desde el menú. |
| C7 | Trabajos interrumpidos al cerrar la pestaña. | hecho | Se anotan al empezar y al arrancar vuelven como tarjeta: «se interrumpió al cerrar la pestaña». |

## P2 · Recorridos, acabado y rendimiento

| # | Punto | Estado | Criterio de aceptación |
|---|---|---|---|
| U1 | Estado de archivo ausente en toda ventana. | hecho | Restaurar o cerrar, nunca un cargador infinito. |
| U2 | Organización: nombres duplicados, destinos inválidos, ciclos de carpetas. | hecho | Se valida todo antes de mover nada: o se mueve completo o no se mueve nada, con el motivo dicho. |
| U3 | Teclado y foco en menús y diálogos. | parcial | Los diálogos ya son `role="dialog"`, cierran con Escape y devuelven el foco a donde estaba. Los menús contextuales siguen sin recorrido con flechas. |
| U4 | Ctrl+Z dentro de un editor no revierte operaciones de archivos. | hecho | Campos de texto y apps con historial propio (hoja de cálculo) se quedan con su Ctrl+Z. |
| U5 | Movimiento reducido respetado. | hecho | `MotionConfig reducedMotion="user"` en la raíz: la preferencia del sistema manda. |
| U6 | Degradación de búsqueda sin modelo local. | hecho | Buscando, sin coincidencias y no pude buscar son tres filas distintas; la búsqueda por nombre nunca se detiene. |

## Verificación

Perfiles sintéticos (Ana, Beto, Prueba Producción) en un origen aparte, nunca la cuenta personal ni archivos
privados. Comprobado en el navegador y con `npm test`.

Pendiente de una sesión futura: recorrido con teclado en menús contextuales, y pruebas automatizadas sobre
IndexedDB (migraciones y aislamiento) que hoy solo están verificadas a mano.
