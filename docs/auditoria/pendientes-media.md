### Browser.tsx

- **:104** — No existe estado de "este sitio no se deja enmarcar". Con x.com, youtube.com, instagram.com o cualquier sitio con X-Frame-Options/frame-ancestors, Chrome dispara igualmente `load`, así que la barrita de carga desaparece y queda dentro de SkyOS la página de error de Chrome en inglés ("refused to connect"). La única pista es el texto del pie (linea 116), que además está `hidden ... lg:inline`: en cualquier pantalla o ventana bajo 1024px no aparece nada en absoluto.
  - *Arreglo:* Convertir esa pista en un estado real y siempre visible tras la carga: una franja o botón fijo "¿No se ve nada? Ábrelo en una pestaña nueva" que ejecute el window.open, en lugar de una frase escondida por breakpoint.
- **:111** — Cerrar el panel de puntos clave con la X solo hace setTaskId(null): la tarea sigue corriendo, sigue gastando la cuota (con la llave Groq compartida, 8k TPM, eso importa) y al terminar suena y aparece una tarjeta ofreciendo abrir el resultado que la persona acaba de descartar. Lo mismo al pulsar "Puntos clave" una segunda vez: se lanza otra tarea y la anterior queda huérfana en segundo plano.
  - *Arreglo:* En onClose llamar a useTasks.getState().remove(taskId) (que aborta el controller) antes de limpiar el estado, y si ya hay taskId en curso no crear otra tarea sino reabrir la que está.
- **:83** — El botón "Puntos clave con Sky" se muestra siempre que haya IA configurada, pero capabilities.serverWebFetch solo es true en Anthropic: con Groq (la opción por defecto de SkyOS, con la llave compartida), OpenAI, Gemini, OpenRouter u Ollama el botón está ahí, con aspecto de funcionar, y siempre acaba en el toast de la linea 43. Para la mayoría de las configuraciones es un botón decorativo.
  - *Arreglo:* Mostrarlo deshabilitado (ToolButton ya acepta `disabled`) con el motivo en el title, o no mostrarlo cuando el proveedor activo no puede leer páginas.

### AppView.tsx

- **:23** — Solo se contempla 'disconnected'. Un servidor en estado 'attention' (la renovación del token falló o hacen falta más permisos; manager.ts:117 guarda el porqué en record.attention) sigue apareciendo en el dock —connectedApps filtra solo los desconectados— y abre la vista completa: cabecera con la cuenta y "N herramientas" como si todo estuviera bien, y cada llamada falla. El motivo guardado en record.attention no se muestra en ningún momento.
  - *Arreglo:* Tratar 'attention' como un estado propio: mostrar record.attention y el botón "Volver a conectar" en lugar de la vista de la app.
- **:133** — `error` se escribe en tres sitios (133, 151, 164) y no se limpia nunca. Si la carga inicial de páginas recientes falla una vez (un corte de red de un segundo), `recent` se queda en null: la barra lateral no muestra el "Leyendo…" (está condicionado a !error), tampoco "Nada por aquí" (la lista es null, no []), y el banner rojo se queda para siempre; aunque luego una búsqueda funcione y aparezcan resultados, el error sigue ahí y el texto de bienvenida (linea 216) ya no vuelve.
  - *Arreglo:* setError(null) al empezar cada llamada y no condicionar el estado vacío a !error, para que la vista pueda recuperarse sola cuando la siguiente llamada sí responde.
- **:151** — Los mensajes de McpError están redactados para el modelo, no para la persona, y aquí se pintan tal cual en el banner: "La sesión de Notion caducó. Pide a la persona que la vuelva a conectar en Apps conectadas." o "Notion necesita más permisos para eso. La persona debe reconectar la app en Apps conectadas." (manager.ts:312 y 317). La app le habla al usuario de "la persona" en tercera persona, como si le hubiera llegado una instrucción ajena.
  - *Arreglo:* Traducir el código del McpError a texto de producto antes de mostrarlo ("Tu sesión de Notion caducó. Vuelve a conectarla en Ajustes.") y dejar el texto actual solo para el resultado que lee el modelo.

### session.ts

- **:236** — La rama sin red promete "Sin conexión por ahora. Lo envío en cuanto vuelva la red." pero no llama persist(): ni el turno en espera (toStored devuelve null para status 'queued', session.ts:86) ni tu propio mensaje ni la cola se guardan en la base. Caso concreto: escribes sin red, recargas la pestaña o se cierra el navegador, y al volver la conversación no tiene ni tu mensaje ni la promesa: nunca se envía y nadie lo dice.
  - *Arreglo:* Persistir el turno en espera y la cola en la fila de la conversación (o en su propia tabla) y rehidratar `queue` en load(), para que la promesa se cumpla también tras una recarga.
- **:245** — Durante un turno en vuelo no se escribe nada: persist() solo se llama al terminar (línea 310) o al fallar (321), y no hay ningún handler de beforeunload/pagehide en el proyecto. Caso concreto: haces una pregunta larga, Sky lleva 30 s trabajando con herramientas y recargas (o se cae la pestaña): al volver no queda ni tu pregunta ni lo ya escrito, como si nunca hubieras hablado.
  - *Arreglo:* Llamar persist(get()) justo después de añadir el turno del usuario, y de nuevo (con el estado 'stopped'/parcial) en pagehide.
- **:96** — toStored guarda `actions` (las etiquetas de lo que Sky hizo) pero ese campo no se lee en ninguna parte del código: ni el mapeo de load() (línea 197) ni el de switchThread() (línea 185) lo restauran, y TurnView solo pinta turn.toolEvents (AssistantPanel.tsx:151). Caso concreto: Sky mueve tres archivos y lo muestra en sus chips; recargas o cambias de proyecto y vuelves, y la respuesta queda como si solo hubiera hablado: no hay rastro de que tocó tus archivos.
  - *Arreglo:* Restaurar `actions` en un campo del Turn y pintarlas como chips estáticos (sin Deshacer, que vive en el diario), o dejar de guardarlas si se decide que no se muestran.

### Files.tsx

- **:160** — La selección es una sola para todo el sistema (`state/ui.ts:39`), así que cada ventana de Archivos informa de una selección que puede no ser suya. Caso: tienes «Fotos» abierta y haces clic en «Recibo.pdf» del escritorio; la barra de estado de la ventana de Fotos dice «Recibo.pdf» aunque ese archivo no está ahí. Peor con Ctrl: como el mousedown del icono corta la propagación, puedes acumular 2 iconos del escritorio y 1 de la ventana; después Supr o un arrastre actúan sobre los tres, incluidos los que no ves porque quedaron tapados por la ventana.
  - *Arreglo:* Guardar la selección por superficie (escritorio y cada ventana con su propio conjunto, o la selección acompañada del contenedor donde nació) y que Supr, Enter, F2 y el arrastre solo alcancen la selección de la superficie activa.
- **:96** — Todas las migas encogen por igual: el `nav` es `flex-1 min-w-0` y cada miga lleva `truncate` sin `shrink-0` ni tooltip. Caso: «Escritorio › Propuestas comerciales › Acme Corporación › Entregables 2026» en una ventana de ancho normal deja una fila de «Escri… › Prop… › Acm… › Entr…», incluida la carpeta actual, que es justo la que importa, y al pasar el mouse no hay título que aclare nada.
  - *Arreglo:* Dar `shrink-0` a la última miga (y a «Escritorio») y colapsar el centro con un «…» que despliegue los niveles ocultos; añadir `title` con el nombre completo a cada miga.

### Mermaid.tsx

- **:61** — El error que se muestra es el mensaje crudo de Mermaid, en inglés y con jerga: escribir «hola» en un bloque de diagrama pinta «No diagram type detected matching given configuration for text: hola»; un flowchart a medias pinta «Parse error on line 2:». Además, vaciar el contenido de un bloque de diagrama no muestra una pista sino una caja roja de error.
  - *Arreglo:* Mostrar una línea corta en español («No entendí el diagrama; revisa la sintaxis de Mermaid») y dejar el detalle técnico en el title del elemento; con code.trim() vacío, mostrar una pista neutra en vez de un error.
- **:68** — El efecto depende de theme (el ajuste), pero el color real se lee del class 'dark' del html. Con el tema en «Sistema», cuando Windows cambia a oscuro App.tsx:35 alterna la clase pero el valor del store sigue siendo 'system': ni el diagrama ni el bloque HTML se vuelven a pintar, así que se quedan con la paleta clara (texto oscuro sobre fondo oscuro) hasta editarlos o reabrir la ventana. Lo mismo pasa en HtmlSandbox.tsx:50, cuyo useMemo depende del mismo valor.
  - *Arreglo:* Exponer en el store un booleano dark que applyTheme actualice (o un hook sobre matchMedia) y usar ese valor como dependencia en ambos componentes.

### Terminal.tsx

- **:35** — El input no se deshabilita mientras corre algo, así que se puede escribir una segunda petición; al pulsar Enter, submit() limpia el draft y run() sale en seco por `get().running` (ai/terminal.ts:61) sin escribir nada. La persona ve cómo su texto desaparece y no pasa absolutamente nada: ni línea de entrada, ni aviso, ni cola.
  - *Arreglo:* Si running, no borrar el draft y escribir una línea de sistema del tipo "Hay algo en marcha; Ctrl+C para detenerlo" (o encolar la petición y ejecutarla al terminar).
- **:41** — El contenedor hace focus() al input en cada click. Al seleccionar salida con el ratón, el click de fin de arrastre mueve el foco al input y la selección del div se pierde: no se puede copiar lo que la terminal imprimió, aunque el área tenga select-text. Además el SelectionMenu que WindowFrame monta en todas las ventanas (WindowFrame.tsx:170) lee la selección en un setTimeout(0) posterior al click, la encuentra ya dentro del input y nunca aparece, así que en la terminal tampoco existe el menú "preguntar a Sky sobre esto".
  - *Arreglo:* Enfocar solo cuando no hay selección: `if (window.getSelection()?.isCollapsed !== false) inputRef.current?.focus()`.

### terminal.ts

- **:65** — El comando "clear" reinicia `lines` pero no toca `history`: el modelo conserva toda la conversación anterior. Tras limpiar, preguntar "¿de qué hablábamos?" responde con lo de antes, y —peor— en Groq (8k tokens por minuto) ese historial invisible sigue provocando esperas y saltos de modelo en una terminal que en pantalla está vacía. El `clear()` del store, que sí limpia lines e history y aborta, no lo llama nadie.
  - *Arreglo:* Que el comando "clear" use get().clear() en vez de hacer solo set({ lines: [WELCOME] }).
- **:98** — onEvent solo atiende 'text', 'tool_start' y 'tool_end': ignora los eventos 'status', que son la única señal durante las esperas largas del agente ("Sky está esperando su turno…", "Cambiando a Anthropic…", "Ajustando la petición…", "Leyendo la página…"). Con la llave Groq compartida un 429 hace esperar hasta 20 s y reintentar, y la terminal no muestra nada más que el spinner: parece colgada. El panel de chat sí los pinta (ai/session.ts:274).
  - *Arreglo:* Atender e.type === 'status' escribiendo (o reemplazando) una línea kind 'system' con el mensaje, y borrarla cuando empiece a llegar texto.

### Trash.tsx

- **:22** — `useLiveQuery(...) ?? []` convierte el estado "todavía no sé" en "está vacía": al abrir la papelera siempre aparece primero el icono con "La papelera está vacía" y los dos botones apagados, y un instante después salta la lista. Con muchos archivos se nota bien, porque fs.listTrash() hace un `.filter()` sobre toda la tabla de nodos sin índice.
  - *Arreglo:* Guardar el resultado sin `?? []`, tratar `undefined` como carga (dejar el área vacía o con los botones en su sitio) y mostrar el estado vacío solo cuando la consulta ya devolvió una lista de cero elementos.
- **:67** — El paso armado dice "¿Seguro? Vaciar" y nada más. Vaciar la papelera es la única acción del escritorio que no deja entrada de deshacer (fs.emptyTrash no declara undo), y además su alcance es invisible: una carpeta en la papelera se ve como una línea sin tamaño, pero purge borra todo su subárbol, así que el aviso "Papelera vaciada (3)" puede haber borrado trescientos archivos. En un producto donde casi todo lo destructivo ofrece Deshacer en el toast, esta pantalla no avisa de que aquí no lo hay.
  - *Arreglo:* Que el estado armado diga que es para siempre (por ejemplo "Se borra para siempre") y, si la papelera tiene carpetas, que el encabezado cuente también lo que hay dentro en vez de solo los elementos de primer nivel.

### openaiCompat.ts

- **:92** — listModels llama a fetch sin try/catch, a diferencia de chat() que sí traduce el fallo de red (línea 148: «No hay conexión con …»). Caso concreto: sin red, o con una URL base mal escrita, pulsar «Consultar modelos disponibles» lanza un TypeError y el toast de Settings.tsx:386 muestra literalmente «Failed to fetch» (o «NetworkError when attempting to fetch resource»), en inglés y con jerga, dentro de una interfaz que habla español sin tecnicismos.
  - *Arreglo:* Envolver ese fetch en try/catch y lanzar un AiError con el mismo tono que chat(): «No hay conexión con {proveedor}.».
- **:155** — El mensaje de error llega crudo al panel (AssistantPanel.tsx:164 pinta turn.error tal cual). Con wifi conectado pero sin internet real (portal cautivo, DNS caído) navigator.onLine es true, la rama offline de session.ts no entra, y lo que se lee es "No hay conexión con Groq. Failed to fetch" — mitad español, mitad inglés de máquina. La línea 176 es peor: `${cfg.name} respondió ${res.status}. ${detail.slice(0, 200)}` vuelca el JSON de error del proveedor en la burbuja, justo debajo del comentario que dice que los diagnósticos se quedan en la consola.
  - *Arreglo:* Dejar el detalle técnico solo en el console.warn y dar al panel una frase corta en español por caso (sin red / el proveedor no responde / la llave no sirve / el modelo no existe).

### manager.ts

- **:328** — En addCustom, `new URL(clean).hostname` se evalúa sin protección cuando el nombre viene vacío. Caso concreto: dejas el campo Nombre en blanco y pegas 'https://' (o 'https://[bad' ), que sí pasa el regex de la línea 327; new URL lanza un TypeError del navegador y el catch de AddServer (Apps.tsx:392) lo muestra tal cual, así que el toast dice en inglés "Failed to construct 'URL': Invalid URL" en una interfaz en español.
  - *Arreglo:* Envolver el parseo en try/catch y lanzar McpError('not_configured', 'Esa dirección no es válida. Revisa que esté completa, como https://mi-servidor.com/mcp').
- **:399** — resumeRedirect y resumeOneDrive (src/system/sync/providers/onedrive.ts:132) consumen la MISMA ranura de un solo uso 'mesa:oauth:result', y no hay nada que distinga de qué flujo vienen los parámetros. En App.tsx, startSync() llama a resumeOneDrive() cuyo prefijo síncrono corre antes que resumeRedirect (que está detrás de `await reload()`). Caso concreto: la persona empezó a conectar OneDrive, se arrepintió y dio Atrás (queda un 'mesa:onedrive:pending' huérfano, porque nada lo caduca); más tarde, en la misma pestaña, conecta Notion y autoriza. Al volver, resumeOneDrive se come los parámetros de Notion, falla el state y lanza el toast 'La respuesta de Microsoft no corresponde a esta sesión' — hablando de Microsoft cuando la persona estaba conectando Notion — y Notion se queda sin conectar sin que nadie diga nada. Lo mismo al revés: FLOW_TIMEOUT_MS está declarado en popup.ts:12 y no se usa en ninguna parte, así que los 'pending' nunca expiran.
  - *Arreglo:* Guardar en el resultado del callback una marca del flujo que lo originó (p. ej. `flow: 'mcp' | 'onedrive'` en el state o en la propia entrada de sessionStorage) y que cada resumidor solo consuma el suyo; y aplicar FLOW_TIMEOUT_MS para descartar pendings viejos.

### Apps.tsx

- **:239** — La línea de estado de sesión se muestra siempre que connected es true, y 'attention' cuenta como connected. Caso concreto: la renovación es rechazada, renew() marca attention = 'La sesión ya no se pudo renovar. Vuelve a conectar la app.' pero deja el refreshToken guardado. La tarjeta entonces imprime, una encima de la otra, 'La sesión se renueva sola' (línea 241, porque el refreshToken sigue ahí) y 'La sesión ya no se pudo renovar...' (línea 246). Dos frases que se contradicen en la misma tarjeta.
  - *Arreglo:* Condicionar la línea de sesión a `connected && !attention`, para que en estado de atención solo se lea el mensaje de atención.
- **:197** — disconnect() no pone estado busy ni tiene try/catch. Caso concreto: das 'Desconectar' en una app del catálogo tras recargar la página (asCache vacío); mcp.disconnect hace discoverAuthorizationServer (uno o varios .well-known, con posible reintento por el puente) y luego el POST de revocación, todo sin timeout, mientras el botón sigue habilitado y la tarjeta no cambia nada: durante segundos la interfaz parece muerta y se puede pulsar varias veces. Si alguno de esos endpoints se queda colgado, 'Desconectar' no termina nunca y el token local nunca se borra; si patch falla, la promesa se rechaza sin toast (se invoca con void) y la tarjeta se queda en 'Conectada'.
  - *Arreglo:* Envolver disconnect con setBusy('Desconectando…') y try/catch con toast de error, y ponerle un timeout a la revocación (o hacerla en segundo plano después de borrar el token local, que es lo que de verdad importa).

### WidgetFrame.tsx

- **:72** — El onContextMenu solo hace stopPropagation y nunca preventDefault, y la capa de widgets no cuelga del div del escritorio, así que al hacer clic derecho sobre cualquier widget aparece el menú nativo del navegador (Recargar, Guardar como, Inspeccionar) dentro del sistema, mientras que el escritorio, los iconos y Archivos abren su propio menú.
  - *Arreglo:* Hacer preventDefault y abrir un menú propio del widget (al menos "Quitar widget"), o como mínimo suprimir el menú nativo.
- **:53** — El arrastre solo acota por abajo (x ≥ 0, y ≥ 44) y nada vuelve a acomodar los widgets al tamaño de la ventana: si abres SkyOS en una pantalla más chica que la última vez, o Sky crea un widget con x: 2000, el widget queda fuera del área visible y no hay manera de recuperarlo a mano (no se puede arrastrar lo que no se ve). Las ventanas sí se reajustan al restaurar (src/state/workspace.ts:66).
  - *Arreglo:* Acotar x/y al viewport al soltar y al montar la capa, como hace workspace.ts con las ventanas, dejando siempre visible la barra de título.

### tasks.ts

- **:58** — tasks.summarizeFolder no comprueba que la carpeta tenga algo. Caso concreto: «resume la carpeta Facturas» estando vacía (o pasando el id de un archivo, o el root en un escritorio recién creado): collectFiles devuelve [], y ai/tasks.ts:270 manda al modelo «Carpeta: "Facturas" con 0 archivos. No hay archivos de texto legibles», que gasta una llamada y produce un resumen de la nada. tasks.synthesize y tasks.pending sí lanzan «No hay archivos que leer en la selección» (ai/tasks.ts:302 y 319); summarizeFolder es la excepción.
  - *Arreglo:* En summarizeFolder, tras collectFiles, lanzar «No hay nada que leer en esa carpeta» si files está vacío, y comprobar que el nodo sea carpeta antes de recorrerlo.
- **:29** — Las tres tareas de fondo se lanzan con background:true, que en ai/tasks.ts:120 significa openWindow:false: nunca existe la ventana Result, que es el único sitio con el botón de detener (components/apps/Result.tsx:78). En la píldora de estado el trabajo en curso se lista sin control alguno y no hay comando para pararlo. Caso concreto: «sintetiza estos 20 archivos», la persona se arrepiente y dice «cancélalo»: Sky no tiene forma de hacerlo y la tarea sigue consumiendo tokens hasta terminar.
  - *Arreglo:* Añadir el botón de detener a la fila de trabajos en curso de StatusPill (llamando a useTasks.getState().stop(job.id), que ya existe) y, mientras no lo haya, que BACKGROUND_REPLY no prometa más de lo que se puede: decir que el aviso llega al terminar y que no se puede cancelar.

### Desktop.tsx

- **:74** — Cuando arrastras archivos del sistema sobre un icono de carpeta del escritorio, el icono se enciende («Soltar aquí» + anillo, NodeIcon.tsx:66) pero el overlay del escritorio sigue encendido porque nadie lo apaga: NodeIcon hace stopPropagation en dragover y el dragleave del contenedor no dispara al entrar a un hijo. Quedan dos destinos pidiendo la misma soltada y el letrero grande dice «Suelta para importar al escritorio» cuando en realidad los archivos van a entrar a la carpeta. Lo mismo pasa dentro de Archivos con el marco punteado y su píldora «Soltar aquí» (Files.tsx:150).
  - *Arreglo:* Apagar el overlay del contenedor cuando el arrastre está sobre un icono que acepta la soltada (por ejemplo, que NodeIcon avise al padre en dragover, o que el contenedor solo se pinte si el target más cercano no es un `[data-node]` de carpeta).

### IconGrid.tsx

- **:19** — `AnimatePresence` en modo sync mantiene en el DOM los iconos que salen hasta que termina su animación, y en Archivos `animateLayout` es false. Caso: navegas de una carpeta con 10 elementos a una con 2; durante ~300 ms la rejilla tiene 12 celdas, los 2 nuevos aparecen empujados detrás de los 10 que se desvanecen y luego brincan de golpe a la esquina superior izquierda. Pasa en cada cambio de carpeta y en cada clic de miga.
  - *Arreglo:* Al cambiar de carpeta no animar la salida: dar a la rejilla una `key` por folderId (o envolver con AnimatePresence solo el escritorio) para que el contenido anterior se desmonte de inmediato.

### NodeIcon.tsx

- **:38** — El mousedown solo contempla Ctrl/Cmd. Mayús+clic cae en la rama `else` y reemplaza la selección por un solo elemento: seleccionas el primer archivo, haces Mayús+clic en el quinto esperando los cinco y te quedas con uno, perdiendo lo que llevabas. Tampoco hay marco de selección: arrastrar sobre el fondo vacío del escritorio o de la ventana no hace absolutamente nada (Desktop.tsx:16, Files.tsx:55 solo limpian).
  - *Arreglo:* Tratar Mayús como rango sobre el orden visible de la rejilla (guardando el ancla de la última selección) y, si el marco no va a existir, al menos que el arrastre en vacío no quede muerto.

### SelectionMenu.tsx

- **:88** — ask() recorta la selección a 6000 caracteres sin decirlo. Caso concreto: seleccionas un documento largo en una ventana y pulsas "Resumir"; Sky resume solo el primer tercio como si fuera todo, con tono confiado, y nada en la interfaz indica que el texto se cortó.
  - *Arreglo:* Cuando el texto exceda MAX_CHARS, decirlo en el propio mensaje ("…(fragmento recortado a 6000 caracteres)") o avisar antes de enviarlo.

### web.ts

- **:12** — looksLikeUrl acepta cualquier texto con un punto y sin espacios, así que escribir "3.5", "notas.txt", "index.js" o "v1.2" en la barra navega a https://3.5 en vez de buscar en Google, y queda un panel en blanco. Y toNavigableUrl (linea 19) devuelve tal cual cualquier cosa que empiece por http(s)://, así que escribir solo "https://" pone src="https://" en el iframe: panel vacío, sin mensaje, y la ventana pasa a titularse "Navegador" porque titleForUrl no pudo parsear.
  - *Arreglo:* Exigir en looksLikeUrl que el último segmento sea un TLD alfabético de 2+ letras, y validar con `new URL()` antes de aceptar una dirección con esquema explícito; si no parsea, tratarla como búsqueda.

### Result.tsx

- **:16** — El efecto hace `el.scrollTop = el.scrollHeight` en cada cambio de task.text mientras corre. En un resultado largo (una síntesis de 20 archivos, una traducción de un documento entero) es imposible subir a releer lo ya escrito: cada fragmento nuevo, hasta 60 veces por segundo, devuelve la vista al final.
  - *Arreglo:* Antes de reposicionar, comprobar que el usuario estaba pegado al final (`scrollHeight - scrollTop - clientHeight < ~40px`) y solo entonces seguir el stream; si se subió a leer, dejarlo donde está.

### jobs.ts

- **:66** — RUNNING_KEY solo lleva el sufijo del usuario, no de la pestaña, y recoverJobs() borra la clave al leerla. Con dos pestañas del mismo usuario abiertas (algo normal en un escritorio web): si en la pestaña A corre un resumen y abres una pestaña B, B anuncia con tarjeta roja 'Se interrumpió al cerrar la pestaña' de un trabajo que en ese momento sigue corriendo en A — y además deja a A sin registro, así que si A se cierra de verdad nadie se entera. Al revés también: remember() de B (sin trabajos) borra la clave escrita por A.
  - *Arreglo:* Guardar la lista de trabajos en curso por pestaña (sessionStorage, o un id de pestaña dentro de la clave/entradas) para que cada pestaña solo recupere y borre lo suyo.

### JobCards.tsx

- **:29** — El temporizador de 9 s solo se detiene con el ratón encima. Para las tarjetas de recuperación de jobs.ts:100 eso significa que el único rastro de trabajo perdido ('Se interrumpió al cerrar la pestaña; vuelve a pedirlo cuando quieras') desaparece a los 9 segundos del arranque — justo mientras entra el escritorio — y no queda registrado en ningún otro sitio: recoverJobs solo empuja cards, no crea jobs, así que el StatusPill tampoco lo muestra. Lo mismo si llegas al botón 'Abrir' con el teclado: la tarjeta se va bajo el foco.
  - *Arreglo:* No autodescartar las tarjetas de tipo 'error' (que se cierren solo con la X) y añadir onFocus/onBlur junto al hover para que el foco de teclado también las retenga.

### CloudSync.tsx

- **:124** — El bloque «Id de aplicación de Microsoft Entra» se muestra siempre que OneDrive no esté conectado, es decir, a todo el mundo: quien solo usa Google Drive o no usa nube ve en Almacenamiento un campo con GUID, URI de redirección y «Files.ReadWrite.AppFolder», la jerga más dura de todos los Ajustes, sin haber pedido nada de OneDrive. Además el id solo se guarda en onBlur (línea 134), sin ninguna señal de que quedó guardado: si lo pegas y pulsas Enter, no pasa nada.
  - *Arreglo:* Mostrar ese bloque solo cuando la persona pulse «Conectar» en la fila de OneDrive (o tras un «Configurar» en esa fila), y guardar el id también al enviar/Enter con una confirmación mínima.

### auth.ts

- **:317** — Cuando la autorización vuelve con error y el servidor no manda error_description, se lanza `params.error` pelado, y resumeRedirect (manager.ts:415) lo empuja como toast. Caso concreto: el proveedor responde ?error=server_error o ?error=invalid_scope y la persona ve un toast que dice literalmente 'server_error' o 'invalid_scope'. Es un código, no una frase, y además queda en inglés. (Mismo patrón en tokenRequest, línea 246: 'El servidor respondió invalid_grant.')
  - *Arreglo:* Mapear los códigos OAuth habituales a frases en español ('El proveedor tuvo un problema y no pudo autorizarte; inténtalo otra vez', 'Esta app no concede alguno de los permisos que Sky pidió') y dejar el código solo para el log.

### transport.ts

- **:293** — httpError termina en `El servidor respondió ${res.status}.` Caso concreto: el servidor MCP está caído y su gateway devuelve 502 o 503; la persona lee 'El servidor respondió 502.' en el toast. Es justo el caso de 'servidor que no responde' y el mensaje es un código HTTP que no le dice nada ni sugiere qué hacer.
  - *Arreglo:* Traducir los rangos a frases: 5xx → 'El servidor de {app} no está respondiendo ahora mismo. Inténtalo en un momento.', 404 → 'No encontré un servidor MCP en esa dirección.', y dejar el número solo como detalle secundario.

### speech.ts

- **:150** — reproducir() llama stopSpeaking() sobre el audio anterior, y audio.pause() no dispara `onended` ni `onerror`: la promesa de speak() del turno anterior nunca se resuelve. Caso concreto: pulsas "Escuchar" en una respuesta y luego en otra — el primer botón se queda en "Silenciar" para siempre aunque no suene nada, y pulsarlo corta la que sí está sonando. Relacionado: nada llama stopSpeaking al desmontar el panel ni en clear(), así que cierras la conversación o la borras y la voz sigue leyendo un mensaje que ya no existe, sin botón para callarla.
  - *Arreglo:* Resolver la promesa del audio anterior al pausarlo (acabar(false) dentro de stopSpeaking) y llamar stopSpeaking() al desmontar Listen y desde clear()/switchThread.

### threads.ts

- **:35** — settle() devuelve temprano si session.running, y watchProjectThread solo se vuelve a disparar cuando cambian las ventanas (useWindows.subscribe, línea 50): nada reintenta al terminar la respuesta. Caso concreto: le pides algo a Sky y mientras contesta abres la carpeta de otro proyecto; el hilo no cambia, la cabecera sigue mostrando el proyecto anterior (o ninguno) y todo lo que escribas después se guarda en la conversación equivocada hasta que muevas una ventana.
  - *Arreglo:* Reintentar settle() cuando running pasa de true a false (suscribirse a useSession) además de al cambiar las ventanas.

### agent.ts

- **:250** — Al abortar se rompe el bucle antes de messages.push(assistant), así que lo que Sky alcanzó a decir no entra en el historial y este queda terminando en un mensaje del usuario sin respuesta. Caso concreto: paras a media respuesta y escribes "sigue": Sky no tiene registro de lo que estaba diciendo; y como la pregunta detenida quedó sin contestar en el historial, en el siguiente turno suele retomarla sola además de responder lo nuevo.
  - *Arreglo:* Al abortar, empujar el mensaje del asistente con el texto parcial (o retirar del historial el prompt sin respuesta) antes de devolver result.messages.

### WeatherWidget.tsx

- **:79** — Sin red, fetchWeather/geocode rechazan con un TypeError del navegador y el catch usa err.message tal cual: el widget muestra "Failed to fetch" (o "NetworkError when attempting to fetch resource" en Firefox) en medio de una interfaz en español. El widget de divisas sí traduce ese caso (CurrencyWidget.tsx:26).
  - *Arreglo:* Detectar el TypeError igual que en divisas y mostrar un texto propio del tipo "Sin conexión para consultar el clima".

### ClockWidget.tsx

- **:6** — timeIn solo cae en el catch si la zona es una cadena inválida. Si un item de zones llega sin timeZone (config del modelo con `{ label: 'Tokio', tz: 'Asia/Tokyo' }`, o zones como lista de cadenas), timeZone es undefined, Intl no lanza y devuelve la hora LOCAL con valid: true: la fila dice "Tokio 22:14" mostrando tu propia hora, sin ninguna señal de error.
  - *Arreglo:* Validar que z.timeZone sea una cadena no vacía antes de formatear y, si no lo es, marcar la fila como "zona inválida" igual que en el catch.

### CurrencyWidget.tsx

- **:11** — from/to se aceptan como cualquier cadena, pero CURRENCIES solo tiene 12 códigos. Si Sky crea el widget con un ISO fuera del catálogo ("pon dólar a peso colombiano" → COP, plausible con la descripción "códigos ISO como USD, MXN, EUR"), el select queda en blanco porque ningún option coincide (línea 62), el pie muestra " → Peso mexicano" con el nombre vacío (línea 102) y la API responde 404, así que el cuerpo dice "No se pudo obtener el tipo de cambio": un widget roto que no explica por qué.
  - *Arreglo:* Validar el código contra CURRENCIES en widgets.create/update (rechazar con un mensaje claro, normalizando a mayúsculas) o pintar el código desconocido como opción del select para que se vea qué está mal.

### profile.ts

- **:37** — user.setLocation borra place/lat/lon de TODOS los widgets de clima que tienen lugar propio, pero su propia descripción dice "Los widgets de clima sin lugar propio la siguen". El caso: elegiste Madrid con el botón "Cambiar lugar" del widget, luego le dices a Sky "me mudé a Monterrey" y tu widget de Madrid cambia solo a Monterrey, sin avisar y sin que el deshacer de esa acción lo devuelva (el undo solo restaura la ubicación del perfil).
  - *Arreglo:* Respetar los widgets con lugar propio (o preguntar antes) y dejar la descripción y el comportamiento diciendo lo mismo.

### blobs.ts

- **:33** — dirPromise ??= guarda la promesa aunque se rechace. Si navigator.storage.getDirectory() falla una sola vez (modo privado, almacenamiento bloqueado por el navegador, permiso revocado), esa promesa rechazada queda cacheada para siempre: a partir de ahi cada get devuelve null (el catch de la linea 55) y cada put lanza, durante toda la sesion y sin forma de recuperarse salvo recargar. Combinado con readText, todos los archivos se ven vacios.
  - *Arreglo:* Poner dirPromise = null en el catch del acceso al directorio para que el siguiente intento vuelva a probar, y dejar constancia del fallo en vez de devolver null en silencio.

### fs.ts

- **:126** — fs.trash no comprueba que los ids existan: db.nodes.update no hace nada con un id muerto, asi que el comando 'tiene exito' igual. Con dos ventanas de Archivos sobre la misma carpeta, borras en una y borras la seleccion vieja en la otra: el toast dice '"Elemento" enviado a la papelera' (ese 'Elemento' es el fallback de la linea 133) y ofrece deshacer algo que no paso. Ademas, si el modelo omite ids, 'ids.length' revienta con un TypeError en ingles que se le devuelve tal cual como resultado de la herramienta.
  - *Arreglo:* Filtrar primero los ids que existen (como ya hace fs.restore en la linea 153), usar ese conteo en el label y, si no queda ninguno, responder 'Eso ya no esta aqui'.

### storage.ts

- **:19** — storage.sync es risk 'external', así que el gate pregunta siempre y con lenguaje de irreversible («Ocurre fuera de este equipo: desde aquí no se puede deshacer») antes de que el comando descubra que no hay nube configurada. Caso concreto: sin proveedor conectado, la persona dice «sincroniza» → diálogo «¿Sincronizar con la nube? · Sí, hazlo» → y el resultado es que no pasa nada, se abre Ajustes. Además la descripción le pide al modelo «si no hay nube configurada, dilo y abre Ajustes con ui.openSettings», algo que no puede saber antes de llamar y que el comando ya hace por su cuenta.
  - *Arreglo:* Que la descripción mande consultar storage.syncStatus primero y llamar a storage.sync solo con enabled true, y quitar de la descripción la instrucción de abrir Ajustes, que ya hace el propio comando.

### WindowFrame.tsx

- **:116** — El foco depende de onPointerDownCapture sobre el frame, pero un clic dentro de un <iframe> no genera pointerdown en el documento padre. Con dos ventanas Navegador encimadas, hacer clic en la pagina de la que esta atras no la trae al frente: sigue detras y con el titulo en gris, y hay que atinarle a su barra de titulo o a su franja de herramientas.
  - *Arreglo:* Cuando la ventana no esta activa, cubrir el area de contenido con una capa transparente que absorba el primer clic para enfocar (y se retire al enfocarse), como hacen los escritorios con contenido embebido.

