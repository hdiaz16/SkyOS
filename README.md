# SkyOS

SkyOS es un escritorio web tranquilo, inspirado en la naturaleza, donde la inteligencia artificial es la protagonista.
Escritorio, carpetas y ventanas como metáfora visual; una barra siempre visible como punto de entrada para pedir,
buscar y navegar. Cada persona tiene su propia sesión, con sus archivos, ajustes y llaves aisladas.

**Estado: fase 1 completa y en pulido (septiembre de 2026).** Todo se guarda en el navegador; publicado en Vercel con
cuatro funciones pequeñas al lado. Con la llave incluida de Groq, o con la tuya de Anthropic, GLM (Z.ai), OpenAI, Gemini,
OpenRouter u Ollama, la IA actúa sobre el escritorio. La auditoría que guía el pulido, con su marcador, vive en
[docs/auditoria](docs/auditoria/README.md).

## Correr en local

```bash
npm install
npm run dev     # el escritorio en http://localhost:5173
npm test        # las pruebas de lo que es caro romper sin darse cuenta
npm run lint    # oxlint
npm run build   # tipos y paquete de producción
```

Abre `http://localhost:5173` en Chrome o Edge. La primera vez aparece el onboarding: tu nombre, tu correo (y un PIN si
quieres) y entrar. Lo demás —tono, autonomía, tema, proveedor— empieza con valores sensatos y se cambia en Ajustes. El
repositorio se llama `mesa` por su nombre de trabajo original; los identificadores internos lo conservan para no perder
datos.

Qué protege SkyOS y qué no, con sus límites dichos sin adornos: [SECURITY.md](SECURITY.md). El estado del pulido en
curso, con sus criterios de aceptación: [docs/pulido.md](docs/pulido.md).

## Qué hace

**Sesiones**

- Cuentas. Con `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`, entrar es tu correo y una contraseña, desde cualquier
  dispositivo; el escritorio local de antes se adopta al entrar (si tenía PIN se pide, porque una contraseña no prueba
  que el correo sea tuyo). Contraseñas de 8 caracteres como mínimo, sin las que cualquiera probaría ni tu propio correo,
  espera creciente tras cinco intentos fallidos y un solo mensaje para «correo o contraseña incorrectos». El proyecto
  de Supabase debe tener «Confirm email» apagado; si no, SkyOS lo detecta al arrancar, sigue con perfiles locales y lo
  dice. Con un SMTP propio y `VITE_ACCOUNTS_MAIL=1`, entrar pasa a ser correo y un código de seis dígitos, con el correo
  verificado; las cuentas con contraseña siguen valiendo. Sin Supabase, registro local en el onboarding: nombre, correo y
  un PIN opcional (PBKDF2); volver es entrar, y la pantalla de inicio deja elegir tu perfil o escribir tu correo.
- Separación por perfil: cada cuenta tiene su base de datos, su carpeta de archivos, sus ajustes, su llave de IA, sus
  widgets, flujos e índice; la sesión se fija al cargar la pestaña, y si otra pestaña entra con otra cuenta, esta se
  detiene en vez de mezclar. El PIN evita entradas de paso, **no** cifra nada: los perfiles son comodidad entre personas
  de confianza, no una frontera de seguridad. El alcance exacto está en [SECURITY.md](SECURITY.md).
- Splash de arranque y onboarding corto: nombre, correo y entrar. Todo lo demás empieza con valores sensatos y se
  cambia en Ajustes; la ubicación se detecta sola mientras escribes, y unos segundos después de entrar una tarjeta
  ofrece los tres permisos (micrófono, ubicación exacta, notificaciones) como interruptores independientes, con uno
  general para prenderlos todos; los mismos interruptores viven en Ajustes › Cuenta, y apagar uno hace que Sky deje de
  usarlo aunque el navegador lo siga permitiendo. Un permiso que el navegador tenga bloqueado se ve bloqueado y, al
  pulsarlo, dice cómo se desbloquea desde el candado de la barra de direcciones.
- El botón Atrás del navegador —el del ratón, Alt+←, el gesto— se queda dentro de SkyOS: en el Navegador vuelve a la
  página anterior; en el resto del escritorio no hace nada, y en ningún caso saca del sitio ni lo recarga.
- El texto dentro de las ventanas y de los diálogos se puede seleccionar y copiar; el escritorio, los iconos y la barra
  siguen sin selección, como en un escritorio de verdad.
  Sky se presenta con lo que puedes probar ahora mismo, no con lo que ya respondiste.

**Escritorio**

- Íconos, carpetas anidadas, ventanas arrastrables, dock integrado en la barra, saludo con tu nombre y reloj con calendario.
- Widgets útiles: clima de tu ubicación (Open-Meteo), divisas (BCE), recientes, reloj mundial, tareas, nota,
  temporizador. La IA puede crear widgets propios en HTML dentro de un marco aislado. Los widgets nacen anclados al
  borde derecho —conservan su zona aunque cambie el tamaño de la pantalla— y los iconos nunca quedan debajo de ellos;
  el pin del marco los suelta o los vuelve a anclar. Se agregan desde el botón Widgets de la barra —una galería con
  los siete tipos y la puerta a pedirle a Sky uno a medida—, con clic derecho en el escritorio o escribiendo «widget» en
  la barra.
- Fondo con gradientes, colinas y luz que deriva; modo claro y noche, cinco acentos y cinco fondos. El de fábrica,
  «Según la hora», vive: los colores siguen la hora real —una mañana en el campo, un mediodía más azul, la tarde
  dorada, el ocaso, la hora azul, la luz de luna— y la luz cálida recorre el cielo como el sol. Entre una hora y otra
  se funden minuto a minuto, anclados al amanecer y al ocaso de donde estás (los aprende el widget del clima); el
  tema claro y el oscuro tienen cada uno su paleta por hora. Se cambian en Ajustes › Apariencia o pidiéndoselo a
  Sky: «ponlo azul», «un fondo más cálido», «que siga la hora del día», «ancla el clima arriba a la derecha», «haz la
  nota más grande» (`ui.appearance`, `widgets.place`), todo con vuelta atrás.

**Barra de Sky** (Ctrl+K)

- Pide cosas en lenguaje natural: la IA usa los mismos comandos que la interfaz, y lo que toca tus archivos, widgets y
  ventanas se puede deshacer.
- Busca archivos por nombre o por significado, ejecuta acciones, lanza flujos guardados y abre Google.
- Calculadora y conversor local: `15% de 3400`, `120 km a millas`, `72 f a c`, `2 gb en mb`.
- Captura de pantalla con selector de área, y dictado por voz con Whisper cuando hay una llave de Groq.

**Archivos inteligentes**

- Contexto dinámico: la carpeta o el archivo de la ventana activa y la selección viajan en cada petición como
  contexto por defecto, así "resume estos archivos" o "qué hay aquí" no necesitan más explicación. Un ✨ en la
  ventana de Archivos abre la barra ya apuntando a esa carpeta.
- Selección como en cualquier escritorio: clic, Ctrl+clic, Mayús+clic para un rango, o arrastrar un rectángulo sobre
  el suelo vacío (también dentro de Archivos). Con varios seleccionados, el clic derecho agrupa en una carpeta nueva,
  etiqueta de una vez, muestra las propiedades (cuántos, cuánto pesan, tipos, dónde, cuándo), abre todos o los manda a
  la papelera; y con Sky: pedir algo con los archivos adjuntos, sintetizarlos en un documento o extraer los pendientes.
  Los archivos de texto viajan en línea con presupuesto por proveedor; `fs.readMany` lee varios de una vez.
- Resumir el contenido de una carpeta sin abrir nada; transformar un archivo con vista previa antes de aplicar.
- Al importar al escritorio, la IA etiqueta y sugiere la carpeta correcta con un clic.
- Búsqueda por significado en el dispositivo: un modelo multilingüe pequeño (Transformers.js, una descarga de unos
  120 MB) convierte los textos en vectores dentro de un Web Worker; la barra encuentra "el reporte de los costos"
  sin tokens ni red. Índice de resúmenes con un modelo rápido como segunda opinión.

**Proyectos: una carpeta que recuerda**

- Cualquier carpeta se convierte en proyecto con un clic derecho (o pidiéndoselo a Sky). A partir de ahí guarda objetivo,
  decisiones, pendientes y bitácora en un `Proyecto.md` dentro de la propia carpeta: se puede leer y editar a mano, viaja
  a la nube con el resto y sobrevive a una exportación.
- Al abrir la carpeta, una franja muestra el objetivo y lo que falta, con un botón **Retomar** que le pregunta a Sky
  dónde nos quedamos. Sky lee esa memoria en cada petición hecha dentro del proyecto y anota los avances al cerrarlos.

**Deshacer, historial y lo que sale afuera**

- Cada acción guarda su inverso como un comando con sus parámetros, no como una función en memoria: el diario se escribe
  en la base de la cuenta y deshacer sigue funcionando después de recargar o al día siguiente.
- El estado del sistema (arriba a la derecha) tiene **Lo que hice** con las tres clases a la vista: lo que se puede
  deshacer, lo que ya solo es historial y lo que pasó en una app conectada, que vive fuera de este equipo.
- Ctrl+Z recorre lo de esta sesión; lo de ayer se deshace a propósito desde esa lista. Un deshacer que llega tarde
  (la papelera ya se vació) falla diciendo por qué en vez de fingir que funcionó.

**Lienzo (Text-to-UI)**

- Un lienzo (`.canvas`) es un tablero libre: bloques de Markdown (notas, tablas), diagramas Mermaid y HTML
  aislado, que se arrastran, redimensionan y editan en su sitio. Sky lo arma desde una frase ("arma el plan
  con un diagrama de fases y una tabla de costos") con `canvas.create`, y lo extiende o corrige con
  `canvas.addBlocks`, `canvas.updateBlock`, `canvas.removeBlock` y `canvas.read`; todo deshacible.
- Mermaid se dibuja también en las respuestas de Sky, en notas y en páginas de Notion (```mermaid), con la paleta
  del tema. La librería se carga solo la primera vez que aparece un diagrama.

**Agentes de fondo**

- Los documentos se leen solos al llegar: un Web Worker extrae el texto de PDF (pdf.js), Word y PowerPoint
  (XML) y Excel (SheetJS) sin congelar el escritorio, y lo guarda junto al archivo. Desde ahí lo usan la búsqueda
  por significado, los resúmenes, los adjuntos y `fs.read`, aunque el proveedor no lea PDF de forma nativa.
- Las tareas de Sky (síntesis, pendientes, resumen de carpeta) pueden correr en segundo plano: Sky responde al
  instante y una tarjeta avisa al terminar con el botón Abrir. Si cierras o tapas la ventana de resultado, la
  tarjeta aparece igual. "¿Qué estás haciendo?" lista los trabajos en curso.

**Ventanas inteligentes**

- Editor con copiloto: selecciona texto y pide mejorar, resumir, traducir o cualquier instrucción; Ctrl+J continúa.
- Navegador con "puntos clave" de la página (Claude lee la URL con `web_fetch`).
- Terminal en lenguaje natural que muestra cada herramienta ejecutada como un comando.

**Sistema**

- Comandos de ventanas: ordenar en cuadrícula o cascada, cerrar o minimizar las inactivas, limpiar escritorio.
- Papelera con restaurar, historial de acciones con deshacer individual y "deshacer todo" por respuesta.

## Apps conectadas (MCP)

Sky se conecta a apps externas por el estándar **Model Context Protocol**: cada app es un servidor MCP remoto
oficial y la autorización es la OAuth 2.1 del propio protocolo (PKCE, Client ID Metadata Documents o registro
dinámico, `resource`, validación de `iss`). No hay llaves que pegar: la persona concede permiso una vez y Sky
renueva los tokens en segundo plano; la sesión vive en su cuenta de este navegador y no vuelve a pedir entrar.

- Catálogo por categorías: Google Drive, Google Docs, Gmail, Google Calendar, Dropbox, Box, Notion, Evernote, Slack,
  Todoist, GitHub, Spotify, Rube (Composio) y Zapier MCP. Cualquier otro servidor MCP se agrega por URL desde el panel.
- Las herramientas de cada app llegan a Sky como `mcp_<app>__<herramienta>`, con su `ttlMs` respetado en caché.
- Transporte Streamable HTTP dual: revisión 2026-07-28 (sin sesiones, `_meta` por petición, cabeceras
  `Mcp-Method`/`Mcp-Name`) con retroceso automático a las revisiones 2025 (`initialize` + `Mcp-Session-Id`).
- Cada persona entra con su propia cuenta, siempre. Dropbox, Notion, Evernote, Todoist y Zapier registran a Sky al
  vuelo (registro dinámico o Client ID Metadata Documents): conectar es un clic sin configurar nada. Google, Spotify,
  GitHub, Slack y Box no lo permiten —comprobado contra los metadatos que publica cada servidor de autorización el 19
  de septiembre de 2026—: quien despliega SkyOS da de alta la aplicación **una vez** en la consola de cada uno (URL de
  retorno `<origen>/oauth/callback`) y pone su id en `VITE_GOOGLE_CLIENT_ID`, `VITE_SPOTIFY_CLIENT_ID`,
  `VITE_GITHUB_CLIENT_ID`, `VITE_SLACK_CLIENT_ID` o `VITE_BOX_CLIENT_ID`. Ese id identifica a la aplicación, es público
  y no da acceso a ninguna cuenta. Donde el servidor además exige un secreto (GitHub, Slack, Box, clientes web de Google),
  el secreto va **sin** prefijo VITE_ (`GITHUB_CLIENT_SECRET`…): se queda en el servidor y el relevo `/api/oauth/proxy`
  lo añade al canje del código; el navegador nunca lo tiene. En Vercel conviene guardarlo como variable **sensible**
  (`vercel env add GITHUB_CLIENT_SECRET production --sensitive`): así ni el panel ni `vercel env pull` lo vuelven a
  mostrar. Nadie ve ids ni secretos en pantalla: la tarjeta de una
  app aún sin alta dice que todavía no está disponible y que cada quien entrará con su cuenta cuando lo esté; Avanzado
  existe solo para los servidores que alguien agregó por URL (su dirección y quitarlo). Spotify, además, limita cada
  cliente en modo desarrollo a cinco personas y exige Premium; para más gente hace falta ser una empresa con 250 000
  usuarios al mes.
- Outlook/Hotmail: Microsoft aún no publica un servidor MCP para cuentas personales; se puede agregar uno propio
  (p. ej. `ms-365-mcp-server`) por URL.
- Puente opcional (`bridge/`): relevo CORS sin estado para servidores MCP u OAuth que no aceptan navegadores.
  En local: `npm run bridge:install` una vez y `npm run bridge` (escucha en 8787), con
  `VITE_BRIDGE_URL=http://127.0.0.1:8787` en `.env.local`. Sky intenta primero directo y solo usa el puente cuando
  el navegador bloquea la llamada.

## Publicar en internet (Vercel + dominio propio)

El escritorio es una página estática, pero el despliegue lleva cuatro funciones pequeñas en `api/` que hacen lo
que un navegador solo no puede (hay una copia para desarrollo en `bridge/`, la misma política en Node):

| Función | Para qué |
| --- | --- |
| `api/ai/[...path].ts` | Habla con Groq poniendo la llave del lado del servidor, así el modelo incluido funciona sin que nadie pegue una llave y sin que la llave viaje al navegador. Solo atiende a la propia página y solo tres rutas: `chat/completions`, `models` y `audio/transcriptions`. En `/api/ai/proxy?target=` repite además, con la llave de la propia persona, las llamadas a los proveedores que rechazan navegadores (Z.ai), y solo a esos hosts. |
| `api/mcp/proxy.ts` | Repite las llamadas a servidores MCP que no envían cabeceras CORS, en streaming, para que Notion, Slack o Drive respondan desde el navegador. |
| `api/oauth/proxy.ts` | Lo mismo para el descubrimiento, el registro y el canje de tokens del OAuth de MCP. |
| `api/geo.ts` | Dice en qué ciudad está la visita leyendo las cabeceras de la red de Vercel: ubicación sin permiso ni terceros. |

**Variables en Vercel** (Project → Settings → Environment Variables):

| Variable | Valor | Nota |
| --- | --- | --- |
| `GROQ_API_KEY` | `gsk_…` | Sin el prefijo `VITE_`. Si además existe `VITE_GROQ_KEY`, bórrala: esa sí acaba en el paquete del navegador. |
| `VITE_APP_ORIGIN` | `https://sky-os.cloud` | Permite identificarse ante los servidores MCP con Client ID Metadata Documents. |
| `VITE_BRIDGE_URL` | vacía | En un despliegue el puente se sirve solo, en `/api` (MCP, OAuth y `/api/ai/proxy`). |
| `AI_RELAY_HOSTS` | opcional | Hosts extra a los que `/api/ai/proxy` puede llevar la llave de la persona; Z.ai ya va incluido. Sin `VITE_`. |
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` | puestas | Encienden las cuentas (correo + contraseña). En Supabase, «Confirm email» debe estar **apagado** mientras no haya SMTP propio; si está encendido, SkyOS lo detecta y sigue con perfiles locales hasta que se apague. |
| `VITE_ACCOUNTS_MAIL` | vacía | Ponla en `1` cuando Supabase tenga SMTP propio y la plantilla `supabase/templates/magic-link.html`: entrar pasa a ser correo + código de seis dígitos. |
| `VITE_GOOGLE_CLIENT_ID`, `VITE_SPOTIFY_CLIENT_ID`, `VITE_GITHUB_CLIENT_ID`, `VITE_SLACK_CLIENT_ID`, `VITE_BOX_CLIENT_ID` | opcional | El alta de SkyOS como aplicación en cada servicio; con el id puesto, cada persona conecta su propia cuenta con un clic. Públicos por diseño. |
| `GOOGLE_CLIENT_SECRET`, `GITHUB_CLIENT_SECRET`, `SLACK_CLIENT_SECRET`, `BOX_CLIENT_SECRET` | opcional | Sin `VITE_`: se quedan en el servidor y `/api/oauth/proxy` los añade al canje del código. El navegador nunca los tiene. En Vercel, guárdalos como variables sensibles (`--sensitive`). |
| `VITE_MS_CLIENT_ID` | opcional | Lo mismo para sincronizar con OneDrive. |

**Dominio en GoDaddy.** En Vercel: Project → Settings → Domains → añadir `sky-os.cloud` y `www.sky-os.cloud`.
Luego, en GoDaddy → DNS:

| Tipo | Nombre | Dato |
| --- | --- | --- |
| A | `@` | `76.76.21.21` (sustituye el registro que apunta a WebsiteBuilder) |
| CNAME | `www` | `cname.vercel-dns.com` |

Los `NS`, el `SOA` y el `TXT` de DMARC se quedan como están. El certificado lo emite Vercel en unos minutos.

## Principios de diseño

- **Vidrio funcional, noche por defecto.** Superficies esmeriladas (`.glass`: blur 24 px), bordes con luz propia en
  oscuro (blanco al 10 %), sombras profundas; el contenido lleva la luz y la interfaz se aparta. Tema claro disponible.
- **Teclado primero.** Ctrl+K sube la barra al centro (Spotlight), atenúa el escritorio y muestra resultados debajo;
  Escape la devuelve al dock. Ctrl+Mayús+Z entra y sale del modo Zen. Ctrl+Z deshace la última acción.
- **Ventanas modulares.** Cabecera de 36 px con tres puntos discretos (cerrar, minimizar, maximizar), doble clic para
  llenar el espacio, ✨ para preguntarle a Sky sobre esa ventana. Arrastrar a un borde encaja a la mitad o a todo con
  resorte (SnapPreview + Motion). Doble clic en el fondo apila las ventanas detrás de la activa por uso reciente.
- **Ayuda en contexto.** Seleccionar texto en cualquier ventana (PDF, Word, Notion, respuestas, lienzos) muestra un
  menú flotante: Resumir, Traducir, Explicar y, si parece tabular, A tabla. El editor conserva su copiloto propio.
- **Cápsula de estado.** Arriba a la derecha: apps conectadas, tokens y latencia de la última respuesta, trabajos de
  fondo con progreso, red y audio; clic para el detalle. Las tarjetas de fondo se van solas.
- **Micro-sonidos y audio de enfoque.** Earcons sintetizados (abrir/cerrar ventana, tarea terminada, Ctrl+K, error,
  snap) con interruptor en Ajustes › Apariencia; lluvia, viento, ruido blanco y café generados en Web Audio desde el
  dock, con volumen.
- **Degradación elegante.** Si Groq agota su cuota y la persona tiene otra llave (Gemini, Anthropic, OpenAI,
  OpenRouter), Sky cambia de proveedor a mitad de la respuesta sin error rojo. Sin red, todo lo local sigue; los
  mensajes a Sky quedan en cola y salen al volver la conexión; la cápsula lo muestra.

## Nube: almacenamiento híbrido

Todo vive en el navegador (OPFS + IndexedDB, por cuenta). En Ajustes › Almacenamiento se elige una nube propia y
SkyOS mantiene ahí una copia de la carpeta «Nube» (o de todo el escritorio); otro dispositivo con la misma cuenta
baja lo que le falte. Sincronización bidireccional por rutas, con enlaces por archivo (`syncState`): sube lo que
cambió aquí, baja lo que cambió allá, borra lo que se borró y, si ambos lados cambiaron, deja la copia de la nube
junto a la local marcada como conflicto. Corre como trabajo de fondo cada 5 minutos, al volver la red y 20 s después
de cambiar archivos; una tarjeta resume lo que se movió. También desde la barra: "sincroniza con Drive".

| Nube | Cómo | Notas |
| --- | --- | --- |
| Google Drive | Conexión MCP de Apps conectadas + API de Drive con ese mismo token (`drive.file`) | Carpeta `SkyOS` en tu Drive, con subcarpetas reales; el MCP oficial no tiene herramienta de actualización, por eso los bytes van por la API |
| Dropbox | Conexión MCP oficial (`mcp.dropbox.com/mcp`) + API v2 con ese token | Carpeta `/SkyOS`; si Dropbox no acepta el registro dinámico, pega tu App Key en Apps › Avanzado |
| OneDrive | Inicio de sesión propio (OAuth PKCE, misma pestaña) con tu app de Microsoft Entra (`VITE_MS_CLIENT_ID` o pegada en Ajustes) | Microsoft no ofrece MCP para cuentas personales; se usa la carpeta de la app (`Apps/SkyOS`, permiso `Files.ReadWrite.AppFolder`) |

Box (`mcp.box.com`) está en el catálogo para las herramientas de Sky; su MCP exige habilitación del administrador.

## Archivos de Office y tipos de archivo

Word, Excel y PowerPoint se leen dentro de Sky, en el navegador y sin que el archivo salga de la máquina:
`docx-preview` maqueta los documentos, SheetJS lee los libros (hojas, filas, columnas) y `pptx-preview` dibuja las
diapositivas. Los iconos del escritorio muestran el logo oficial del programa o del lenguaje (Word, Excel, PowerPoint,
PDF, HTML, CSS, JavaScript, TypeScript, React, Python, Markdown, Go, Rust, Dockerâ¦) sobre una hoja con una banda de su
color; el resto usa un glifo tintado por tipo (`src/lib/fileIcons.ts`, logos en `public/filetypes`).

Editar con la paquetería completa dentro de Sky requiere un servidor de documentos (ONLYOFFICE Docs o Collabora,
autoalojados) o la cuenta de Microsoft 365 a través de Microsoft Graph; ambos están en la fase siguiente.

## Proveedores y modelo automático

| Proveedor | Cómo | Modelo automático |
| --- | --- | --- |
| Groq (por defecto) | Protocolo de OpenAI, llave incluida del lado del servidor, nunca visible en la interfaz; si no responde, Sky solo dice que está atendiendo muchas solicitudes e invita a usar una llave propia | GPT-OSS 20B para lo cotidiano; GPT-OSS 120B para tareas complejas o redacción larga. Whisper Large v3 Turbo para dictar. |
| Anthropic (Claude) | SDK oficial en el navegador | Haiku 4.5 para lo simple, Sonnet 5 para lo medio, Opus 5 para lo complejo. Lee PDF, imágenes y páginas web. |
| GLM (Z.ai) | Protocolo de OpenAI a través del relevo (`/api/ai/proxy` o el puente local), porque Z.ai no acepta llamadas desde el navegador | La lista de modelos llega viva al pegar la llave; el más barato (Flash/Air) carga lo cotidiano y solo lo difícil sube al completo; con una imagen adjunta viaja al `-v` más nuevo. |
| OpenAI, Gemini, OpenRouter | Protocolo de chat completions | Modelo fijo o automático según el proveedor; lista de modelos en vivo. |
| Ollama, compatibles | Misma interfaz, URL base propia | Modelos locales sin llave. |

La voz de Sky sale del navegador por defecto; con una llave de Gemini o de ElevenLabs (Ajustes › Apariencia › La voz de
Sky) habla con una voz hecha para hablar, con la voz y el modelo que cada quien elija.

**Lo que viaja en cada petición, y por qué.** Medido en un escritorio real: las reglas de Sky son unos 1 000 tokens, el
`<estado>` del escritorio unos 400, y el manual completo de herramientas —58 comandos— unos 6 100. Con Anthropic el
manual viaja entero y en orden fijo, porque su caché de prefijo lo cobra a una décima y así el modelo nunca carece de
una herramienta. Con Groq (8 000 tokens por minuto en la llave compartida) y los proveedores compatibles con OpenAI
viaja lo que la petición pide —enrutado por lo que dice—, un núcleo que cualquier turno puede necesitar y una
herramienta de búsqueda que trae el resto: unas 12 herramientas y 5 KB en vez de 58 y 22 KB. Las apps conectadas
viajan solo cuando la petición las nombra. En desarrollo, la consola imprime la anatomía de cada turno.

El enrutador estima la dificultad por la forma de la petición (adjuntos, longitud, verbos de análisis o redacción,
pasos encadenados) sin gastar una llamada extra, y cada respuesta muestra qué modelo la atendió.

## Arquitectura

```
src/
  system/            cuentas y sesión
    session.ts       sesión activa, legible al cargar; suffix para claves por usuario
    db.ts / users.ts registro de personas (Dexie "mesa-system"), PIN con PBKDF2
    auth.ts          estado del shell: splash, login, onboarding, listo
    firstBoot.ts     contenido y widgets iniciales de una cuenta nueva
  kernel/            núcleo sin UI
    fs.ts            sistema de archivos (OPFS + Dexie), una base por usuario
    widgets.ts       widgets persistidos · flows.ts rutinas guardadas
    project.ts       memoria de proyecto en un Proyecto.md dentro de la carpeta
    commands.ts      registro de comandos, dispatch, diario y deshacer con inversos escritos
    journal.ts       el diario en disco: deshacer que sobrevive a la recarga
    commands/        fs.*, ui.*, widgets.*, flows.*, project.*, consultas y sistema
  ai/                capa de IA neutral al proveedor
    settings.ts      proveedores (Groq, Anthropic, OpenAI, OpenRouter, Ollama), niveles de modelo
    router.ts        modelo automático por dificultad
    tools.ts         comandos → herramientas del modelo: manual entero donde se cachea, selección compacta donde se mide
    agent.ts         bucle de agente con streaming y runId para deshacer
    providers/       anthropic (SDK oficial), compatible con OpenAI, simulador
    context.ts       prompt de sistema con el perfil de la persona + estado del escritorio por turno
    session.ts       conversación de la barra · tasks.ts trabajos con ventana de resultado
    indexer.ts       índice y búsqueda por significado · classify.ts sugerencias al importar
    snap.ts          captura de pantalla · voice.ts dictado · terminal.ts consola
  state/             Zustand: ventanas, selección y menús, ajustes, diálogo
    workspace.ts     el escritorio como lo dejaste: ventanas guardadas y devueltas al arrancar
  components/        shell (splash, login, onboarding, orbe), escritorio, barra, panel, ventanas, widgets, apps
  lib/               calculadora, unidades, clima, divisas, menús, utilidades
```

**El bus de comandos es la pieza central.** Botones, menús, la barra y la IA llaman exactamente los mismos comandos.
Cada comando declara sus parámetros con una descripción legible (esa descripción es la documentación que recibe el
modelo) y devuelve una función de deshacer. La IA nunca puede hacer algo que la persona no pueda revertir.

## Siguiente fase

Sincronización en la nube cambiando el adaptador de almacenamiento, montar una carpeta real del disco, exportar todo, PWA.

## Stack

Vite · React 19 · TypeScript · Tailwind 4 · Motion · Zustand · Dexie · OPFS · SDK de Anthropic
