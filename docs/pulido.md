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
| C5 | Conversación propia por proyecto. | pendiente | Dos proyectos conservan hilos separados; cambiar de proyecto cambia el contexto. |
| C6 | Memoria corregible desde la interfaz. | pendiente | Se puede editar y borrar lo que Sky recuerda sin abrir el archivo. |
| C7 | Trabajos interrumpidos al cerrar la pestaña. | pendiente | Al volver figuran como interrumpidos, no como corriendo. |

## P2 · Recorridos, acabado y rendimiento

| # | Punto | Estado | Criterio de aceptación |
|---|---|---|---|
| U1 | Estado de archivo ausente en toda ventana. | hecho | Restaurar o cerrar, nunca un cargador infinito. |
| U2 | Organización: nombres duplicados, destinos inválidos, ciclos de carpetas. | pendiente | Mover una carpeta dentro de sí misma se rechaza con motivo. |
| U3 | Teclado y foco en menús y diálogos. | pendiente | Todo operable sin ratón; Escape consistente; foco devuelto. |
| U4 | Ctrl+Z dentro de un editor no revierte operaciones de archivos. | pendiente | Escribiendo en un editor, Ctrl+Z deshace texto. |
| U5 | Movimiento reducido respetado. | pendiente | Con `prefers-reduced-motion` no hay animaciones de entrada. |
| U6 | Degradación de búsqueda sin modelo local. | pendiente | Distingue «sin coincidencias», «índice pendiente» y «error». |

## Verificación

Perfiles sintéticos, nunca la cuenta personal de Hector ni archivos privados.
