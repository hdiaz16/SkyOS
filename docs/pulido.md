# Plan de pulido de SkyOS

**Regla única: no se agrega nada.** Todo lo que sigue es terminar lo que ya existe. Si al pulir aparece la
tentación de una función nueva, se anota al final y no se hace.

Cada punto lleva su **criterio de aceptación**: cómo se sabe que quedó. Un punto solo se marca hecho cuando se
verificó en el navegador con perfiles sintéticos, nunca porque compile.

Estados: `hecho` · `parcial` · `pendiente`.

Verificación: `npm test` · `npx tsc -b` · `npm run lint` · `npm run build`.
Perfiles de prueba en `localhost`; la cuenta real vive en `127.0.0.1`, que es otro origen.

---

## Bloque 0 · La entrada

Lo primero que ve cualquiera. Nada aquí puede quedar a medias.

| # | Punto | Estado | Criterio |
|---|---|---|---|
| 0.1 | Cuenta con Supabase: entrar, crear, volver | hecho | Correo y código; volver abre el mismo escritorio |
| 0.2 | Correo de acceso con la identidad de Sky | hecho | `supabase/templates/magic-link.html`; falta pegarlo |
| 0.3 | Plantilla con `{{ .Token }}` y Site URL en el panel | pendiente | Llega el código de seis dígitos a un correo real y entra |
| 0.4 | Cerrar sesión cierra también la cuenta | hecho | Vuelve a la pantalla de dos puertas |
| 0.5 | Adopción del escritorio anterior | parcial | La pantalla existe; falta probarla con un escritorio real de antes |
| 0.6 | Sesión caducada mientras el escritorio está abierto | pendiente | Se detiene y lo dice; no sigue escribiendo |
| 0.7 | Entrar sin red con sesión en caché | pendiente | Abre y avisa que revalidará al volver la red |
| 0.8 | Onboarding: dos pantallas, tema claro, escritorio vacío | hecho | Nombre y entrar; solo el widget del clima |
| 0.9 | Step corto de permisos ya dentro del escritorio | pendiente | Una tarjeta, no una pantalla; se puede omitir y no vuelve |
| 0.10 | Primer mensaje de Sky | parcial | Lo que propone tiene que existir en un escritorio vacío |
| 0.11 | Variables en Vercel y entrar desde el dominio | pendiente | Entrar en `www.sky-os.cloud` con correo y código |

---

## Bloque 1 · El escritorio y sus ventanas

| # | Punto | Estado | Criterio |
|---|---|---|---|
| 1.1 | Marco: encabezado, tres puntos, ✨, doble clic | parcial | Cada control hace lo que promete |
| 1.2 | Redimensionar desde los ocho bordes | pendiente | Ningún borde se resiste; el cursor cambia en los ocho |
| 1.3 | Snap, maximizar, restaurar | hecho | Con vista previa antes de soltar |
| 1.4 | Zen y mazo de ventanas | hecho | Ctrl+Mayús+Z; doble clic en el fondo apila |
| 1.5 | Orden de apilado y foco | pendiente | Un clic trae la ventana al frente, una sola vez |
| 1.6 | Ventana fuera de pantalla al achicar el navegador | pendiente | Ninguna queda inalcanzable |
| 1.7 | Menús contextuales del fondo y de un archivo | parcial | Mismo orden; separadores que agrupan de verdad |
| 1.8 | Selección: clic, Ctrl, Mayús, marco | pendiente | Las cuatro formas funcionan y se ven |
| 1.9 | Arrastrar entre ventanas y al escritorio | pendiente | El destino se ilumina; soltar fuera no pierde nada |
| 1.10 | Iconos: nombres largos, tipos sin icono propio | pendiente | Un nombre de 60 caracteres no rompe la rejilla |
| 1.11 | Renombrar en línea (F2) | pendiente | Escape cancela, Enter confirma, el duplicado se resuelve solo |
| 1.12 | Papelera | parcial | Vaciar avisa que no tiene vuelta |
| 1.13 | Barra superior: saludo, reloj, calendario, estado | parcial | El calendario abre y cierra con Escape |
| 1.14 | Fondo y luz | hecho | — |

---

## Bloque 2 · La barra de Sky

| # | Punto | Estado | Criterio |
|---|---|---|---|
| 2.1 | Ctrl+K desde cualquier lugar, incluso dentro de un editor | pendiente | Siempre enfoca; nunca escribe la K |
| 2.2 | Orden de resultados | pendiente | Lo más probable primero, sin saltos al escribir |
| 2.3 | Flechas y Enter | pendiente | El resaltado no se pierde; Enter abre lo resaltado |
| 2.4 | Búsqueda por significado: buscando, sin coincidencias, error | hecho | Tres respuestas distintas |
| 2.5 | Calculadora y conversor | pendiente | `15% de 3400`, `120 km a millas`, `72 f a c` |
| 2.6 | Adjuntos: arrastrar, pegar, quitar | pendiente | Se ve qué viaja y se puede quitar antes de enviar |
| 2.7 | Dictado | pendiente | Pide el micrófono; si se niega, lo dice y sigue con texto |
| 2.8 | Captura con selector | pendiente | Escape cancela sin dejar nada |
| 2.9 | Flujos por nombre | pendiente | Aparecen al escribirlos; al correr dicen qué hicieron |

---

## Bloque 3 · El panel de Sky

| # | Punto | Estado | Criterio |
|---|---|---|---|
| 3.1 | Estado vacío | hecho | Dice para qué sirve |
| 3.2 | Turnos: streaming, parar, reintentar | pendiente | Parar deja lo escrito y lo marca detenido |
| 3.3 | Fichas de herramienta: corriendo, hecha, fallida, externa | hecho | «En la app» para lo que salió del equipo |
| 3.4 | Deshacer desde el panel y deshacer la respuesta entera | hecho | — |
| 3.5 | Errores del modelo: 429, sin llave, sin red, modelo caído | parcial | Cada uno con su frase y su salida |
| 3.6 | Hilo por proyecto y hilo general | hecho | El encabezado dice en cuál estás |
| 3.7 | Limpiar conversación | parcial | Falta confirmar antes de borrar |
| 3.8 | Lectura en voz alta | pendiente | Se puede callar a media frase |
| 3.9 | Adjuntos del turno: imagen, PDF, texto | pendiente | Se ve qué leyó y qué no pudo leer |

---

## Bloque 4 · Las aplicaciones, una por una

Para cada una: abrir, usar, cerrar, reabrir, archivo que desaparece, archivo enorme, archivo corrupto, ventana
diminuta, ventana maximizada, teclado.

| # | Aplicación | Estado | Lo que hay que dejar fino |
|---|---|---|---|
| 4.1 | Archivos | parcial | Migas largas, orden, franja de proyecto, arrastre, vacío |
| 4.2 | Editor de texto | pendiente | Guardado visible, deshacer propio, ✨ sobre selección, Markdown |
| 4.3 | Hoja de cálculo | parcial | Guardar archivos grandes, fórmulas, menú de rango |
| 4.4 | Visor de PDF | parcial | Zoom, páginas, PDF protegido, PDF roto |
| 4.5 | Visor de imágenes | parcial | Imagen enorme, formato no soportado, zoom |
| 4.6 | Documentos de Office | parcial | Docx con imágenes, pptx, archivo que no abre |
| 4.7 | Lienzo | parcial | Bloques fuera de vista, Mermaid inválido, HTML pesado |
| 4.8 | Navegador | parcial | Sitio que rechaza el marco, navegación, puntos clave |
| 4.9 | Terminal | pendiente | **Sin revisar.** Qué hace, qué no, y si debe seguir existiendo |
| 4.10 | Resultado de tarea | parcial | Corriendo, error, resultado largo, guardarlo |
| 4.11 | Papelera | parcial | Ordenar, restaurar varios, vaciar |
| 4.12 | Apps conectadas | pendiente | Catálogo, conectar, desconectar, error de autorización |
| 4.13 | Vista de una app conectada | pendiente | Qué muestra cuando la app no responde |
| 4.14 | Nube | pendiente | Conectar, primer sincronizado, conflicto, desconectar |
| 4.15 | Ajustes · Cuenta | pendiente | Correo, PIN, cerrar sesión, borrar cuenta |
| 4.16 | Ajustes · Inteligencia | parcial | Proveedor, llave, modelos, prueba de conexión |
| 4.17 | Ajustes · Flujos | pendiente | Editar, borrar, renombrar |
| 4.18 | Ajustes · Apariencia | parcial | Tema, sonidos, movimiento |
| 4.19 | Ajustes · Almacenamiento | parcial | Espacio, índice, nube, borrar datos |
| 4.20 | Ajustes · Acerca de | pendiente | Versión, licencias, enlace a SECURITY.md |

---

## Bloque 5 · Los widgets

Para cada uno: crear, mover, redimensionar, configurar, quitar, sin red, sin datos.

| # | Widget | Estado | Criterio |
|---|---|---|---|
| 5.1 | Clima | parcial | Sin ubicación, sin red, lugar que no existe |
| 5.2 | Divisas | pendiente | Código inválido, día sin tasa |
| 5.3 | Recientes | pendiente | Vacío, archivo borrado en la lista |
| 5.4 | Reloj mundial | pendiente | Zona inválida, muchas zonas |
| 5.5 | Tareas | pendiente | Lista larga, texto largo, borrar |
| 5.6 | Nota | pendiente | Guardado, texto largo |
| 5.7 | Temporizador | pendiente | Terminar en segundo plano, sonido, reiniciar |
| 5.8 | HTML de Sky | hecho | Aislado y sin red |

---

## Bloque 6 · Los comandos (70)

Para cada uno: descripción que el modelo entienda sin adivinar, parámetros mínimos, qué devuelve, qué pasa con
entrada vacía o inválida, y su `risk` correcto.

| # | Familia | Cuántos | Estado | Criterio |
|---|---|---|---|---|
| 6.1 | `fs.*` | 14 | parcial | Nombres duplicados, destinos inválidos, ids que ya no existen |
| 6.2 | `ui.*` | 17 | parcial | Ventanas ya cerradas, escritorio vacío |
| 6.3 | `widgets.*` | 5 | pendiente | Config inválida por tipo |
| 6.4 | `canvas.*` | 6 | parcial | Bloques inválidos, archivo que no es lienzo |
| 6.5 | `flows.*` | 5 | pendiente | Nombre repetido, instrucciones vacías |
| 6.6 | `project.*` | 4 | hecho | — |
| 6.7 | `tasks.*` | 3 | pendiente | Cancelar, fallo parcial, resultado enorme |
| 6.8 | `storage.*` | 2 | pendiente | Sin nube configurada |
| 6.9 | `system.*`, `apps.*`, `user.*` | 6 | parcial | — |
| 6.10 | Errores como frases, no como códigos | pendiente | Ningún mensaje técnico llega a la persona |

---

## Bloque 7 · Los prompts

| # | Punto | Estado | Criterio |
|---|---|---|---|
| 7.1 | Prompt del sistema | parcial | Cada línea gana su lugar; nada repetido |
| 7.2 | Voz de Sky por situación | parcial | Cálida, sobria, cuidadosa; nunca de manual |
| 7.3 | Perfil de la persona | parcial | Tono, propósito y autonomía cambian la respuesta de verdad |
| 7.4 | Estado del escritorio por turno | parcial | Solo lo que sirve, medido en tokens |
| 7.5 | Tareas: sintetizar, pendientes, resumir carpeta | pendiente | Resultado con la misma forma siempre |
| 7.6 | Transformaciones de texto (6) | pendiente | Cada una hace exactamente lo que dice |
| 7.7 | Puntos clave de una página | pendiente | — |
| 7.8 | Clasificación al importar | pendiente | Sugiere carpeta con criterio |
| 7.9 | Resumen rodante de la conversación | pendiente | No pierde lo que importa al condensar |
| 7.10 | Contenido no confiable declarado como datos | hecho | — |

---

## Bloque 8 · Apps conectadas (MCP)

| # | Punto | Estado | Criterio |
|---|---|---|---|
| 8.1 | Catálogo: 9 categorías, 18 apps | pendiente | Cada tarjeta con logo, nombre y qué hace |
| 8.2 | Conectar: autorización, ventana, vuelta | pendiente | Si se cierra a medias, lo dice y se reintenta |
| 8.3 | Token caducado o revocado | pendiente | Pide reconectar; no falla en silencio |
| 8.4 | Servidor caído o que responde mal | pendiente | Frase clara y la app marcada |
| 8.5 | Herramientas que llegan del servidor | pendiente | Solo viajan cuando la petición las nombra |
| 8.6 | Confirmación antes de escribir afuera | hecho | Puerta de consentimiento |
| 8.7 | Desconectar y borrar el token | pendiente | No queda rastro |
| 8.8 | Servidor propio | pendiente | URL inválida, sin CORS, sin OAuth |

---

## Bloque 9 · Los seis estados de toda superficie

**Vacío, cargando, error, sin red, sin IA, sin permiso.**

| # | Punto | Estado | Criterio |
|---|---|---|---|
| 9.1 | Archivo que ya no está | hecho | Restaurar o cerrar |
| 9.2 | Sin red | parcial | Cola de mensajes; falta que cada app lo diga |
| 9.3 | Sin IA configurada | parcial | Alternativa local en cada punto donde se ofrece Sky |
| 9.4 | Permiso negado | pendiente | Se dice qué se pierde y cómo volver a darlo |
| 9.5 | Almacenamiento lleno | pendiente | Aviso antes de romperse |
| 9.6 | Trabajos interrumpidos | hecho | Vuelven como interrumpidos |
| 9.7 | Migración fallida | pendiente | No se borra nada; se dice qué pasó |

---

## Bloque 10 · Teclado y accesibilidad

| # | Punto | Estado | Criterio |
|---|---|---|---|
| 10.1 | Foco visible en todo lo enfocable | pendiente | Se ve dónde está sin adivinar |
| 10.2 | Menús contextuales con flechas y Escape | pendiente | Operables sin ratón |
| 10.3 | Diálogos: foco atrapado, Escape, foco devuelto | parcial | Falta atrapar el foco dentro |
| 10.4 | Atajos que no chocan con el navegador | pendiente | Revisados y documentados |
| 10.5 | Etiquetas en iconos sin texto | pendiente | Cada botón dice qué hace |
| 10.6 | Contraste en claro y en noche | pendiente | Medido, no estimado |
| 10.7 | Movimiento reducido | hecho | — |
| 10.8 | Pantalla chica | pendiente | La barra, el panel y las ventanas caben |

---

## Bloque 11 · Rendimiento

Medir antes de tocar. Nada se optimiza sin número.

| # | Punto | Estado | Criterio |
|---|---|---|---|
| 11.1 | Arranque hasta el escritorio | pendiente | Medido en frío y en caliente |
| 11.2 | Paquete de 1.9 MB en un solo trozo | pendiente | El escritorio no espera a Mermaid ni a Office |
| 11.3 | Carpeta con 500 archivos | pendiente | Sin trabar el arrastre |
| 11.4 | Documento largo | pendiente | Escribir sin retraso perceptible |
| 11.5 | Extracción e indexación de fondo | pendiente | No compiten con lo que la persona hace |
| 11.6 | Mover y redimensionar ventanas | pendiente | Fluido con seis ventanas abiertas |

---

## Bloque 12 · Los textos

Barrido completo: **ningún texto de sistema, ninguna promesa de más, ninguna frase de manual.** Se lee en voz
alta; si suena a software, se reescribe.

| # | Superficie | Estado |
|---|---|---|
| 12.1 | Entrada y cuenta | hecho |
| 12.2 | Onboarding y primer mensaje | parcial |
| 12.3 | Menús, botones y etiquetas | pendiente |
| 12.4 | Errores de comandos | pendiente |
| 12.5 | Estados vacíos | parcial |
| 12.6 | Ajustes | pendiente |
| 12.7 | Catálogo de apps | pendiente |
| 12.8 | README y documentación | parcial |

---

## Bloque 13 · Verificación

| # | Punto | Estado |
|---|---|---|
| 13.1 | 42 pruebas automatizadas | hecho |
| 13.2 | Pruebas sobre IndexedDB: migraciones y aislamiento | pendiente |
| 13.3 | Recorrido documentos → propuesta → retomar mañana | parcial |
| 13.4 | Dos usuarios, dos pestañas, sesión caducada | parcial |
| 13.5 | Repaso visual de las 20 pantallas, en claro y en noche | pendiente |

---

## Orden de ataque

1. **Bloque 0** hasta el final: la entrada es lo único que todos ven sí o sí.
2. **Bloque 9** y **12.4**: los estados y los errores, que es lo que más se nota cuando falla.
3. **Bloque 4**, aplicación por aplicación, empezando por Archivos, Editor y Hoja de cálculo.
4. **Bloques 2 y 3**: la barra y el panel, donde vive Sky.
5. **Bloques 6 y 7**: comandos y prompts, midiendo tokens.
6. **Bloque 8**: apps conectadas.
7. **Bloques 1, 5, 10, 11**: ventanas, widgets, teclado y rendimiento.
8. **Bloque 13**: cerrar con verificación y capturas.

## Lo que se anota y no se hace

RAG con Supabase, más widgets, más apps en el catálogo, edición colaborativa, aplicación de escritorio.
