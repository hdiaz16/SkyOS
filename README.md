# SkyOS

SkyOS es un escritorio web tranquilo, inspirado en la naturaleza, donde la inteligencia artificial es la protagonista.
Escritorio, carpetas y ventanas como metáfora visual; una barra siempre visible como punto de entrada para pedir,
buscar y navegar. Cada persona tiene su propia sesión, con sus archivos, ajustes y llaves aisladas.

**Estado: fase 1 completa, con sesiones y onboarding.** Funciona en local; todo se guarda en el navegador. Con una llave
de Groq (gratuita) o de Anthropic, u otro proveedor compatible con OpenAI incluido Ollama, la IA actúa sobre el escritorio.

## Correr en local

```bash
npm install
npm run dev
```

Abre `http://localhost:5173` en Chrome o Edge. La primera vez aparece el onboarding: nombre, cómo quieres que te hable,
para qué usarás Sky, cuánta autonomía darle, tema, ubicación, proveedor de IA (Groq por defecto, con enlace para crear
la llave) y un PIN opcional. El repositorio se llama `mesa` por su nombre de trabajo original; los identificadores
internos lo conservan para no perder datos.

## Qué hace

**Sesiones**

- Pantalla de inicio con las personas que usan este navegador; PIN opcional (PBKDF2). Cerrar sesión vuelve al inicio.
- Aislamiento real: cada cuenta tiene su base de datos, su carpeta de archivos, sus ajustes, su llave de IA, sus widgets,
  flujos e índice. Nada se comparte entre cuentas.
- Splash de arranque y onboarding de cuatro pantallas (saludo, nombre, cómo trabajamos, tu espacio) con el orbe de Sky; las respuestas se integran al prompt
  del sistema para que Sky hable y actúe como cada persona pidió.

**Escritorio**

- Íconos, carpetas anidadas, ventanas arrastrables, dock integrado en la barra, saludo con tu nombre y reloj con calendario.
- Widgets útiles: clima de tu ubicación (Open-Meteo), divisas (BCE), recientes, reloj mundial, tareas, nota,
  temporizador. La IA puede crear widgets propios en HTML dentro de un marco aislado.
- Fondo con gradientes, colinas y luz que deriva; modo claro y noche.

**Barra de Sky** (Ctrl+K)

- Pide cosas en lenguaje natural: la IA usa los mismos comandos que la interfaz y todo queda deshacible.
- Busca archivos por nombre o por significado, ejecuta acciones, lanza flujos guardados y abre Google.
- Calculadora y conversor local: `15% de 3400`, `120 km a millas`, `72 f a c`, `2 gb en mb`.
- Captura de pantalla con selector de área, y dictado por voz con Whisper cuando hay una llave de Groq.

**Archivos inteligentes**

- Contexto dinámico: la carpeta o el archivo de la ventana activa y la selección viajan en cada petición como
  contexto por defecto, así "resume estos archivos" o "qué hay aquí" no necesitan más explicación. Un ✨ en la
  ventana de Archivos abre la barra ya apuntando a esa carpeta.
- Acciones en lote sobre la selección (clic derecho): pedir algo a Sky con los archivos adjuntos, sintetizarlos en
  un documento o extraer los pendientes de todos. Los archivos de texto viajan en línea con presupuesto por proveedor;
  `fs.readMany` lee varios de una vez.
- Resumir el contenido de una carpeta sin abrir nada; transformar un archivo con vista previa antes de aplicar.
- Al importar al escritorio, la IA etiqueta y sugiere la carpeta correcta con un clic.
- Búsqueda por significado en el dispositivo: un modelo multilingüe pequeño (Transformers.js, una descarga de unos
  120 MB) convierte los textos en vectores dentro de un Web Worker; la barra encuentra "el reporte de los costos"
  sin tokens ni red. Índice de resúmenes con un modelo rápido como segunda opinión.

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

- Catálogo por categorías: Google Drive, Google Docs, Gmail, Google Calendar, Notion, Evernote, Slack, Todoist,
  GitHub y Spotify. Cualquier otro servidor MCP se agrega por URL desde el panel.
- Las herramientas de cada app llegan a Sky como `mcp_<app>__<herramienta>`, con su `ttlMs` respetado en caché.
- Transporte Streamable HTTP dual: revisión 2026-07-28 (sin sesiones, `_meta` por petición, cabeceras
  `Mcp-Method`/`Mcp-Name`) con retroceso automático a las revisiones 2025 (`initialize` + `Mcp-Session-Id`).
- Google no registra clientes al vuelo: hace falta un cliente OAuth de Google Cloud (`VITE_GOOGLE_CLIENT_ID` y
  `VITE_GOOGLE_CLIENT_SECRET`, o Apps conectadas › Avanzado).
- Outlook/Hotmail: Microsoft aún no publica un servidor MCP para cuentas personales; se puede agregar uno propio
  (p. ej. `ms-365-mcp-server`) por URL.
- Puente opcional (`bridge/`): relevo CORS sin estado para servidores MCP u OAuth que no aceptan navegadores.
  En local: `npm run bridge:install` una vez y `npm run bridge` (escucha en 8787), con
  `VITE_BRIDGE_URL=http://127.0.0.1:8787` en `.env.local`. Sky intenta primero directo y solo usa el puente cuando
  el navegador bloquea la llamada.

## Publicar en internet (Vercel + dominio propio)

El escritorio es una página estática, pero el despliegue lleva cuatro funciones pequeñas en `api/` que hacen lo
que un navegador solo no puede:

| Función | Para qué |
| --- | --- |
| `api/ai/[...path].ts` | Habla con Groq poniendo la llave del lado del servidor, así el modelo incluido funciona sin que nadie pegue una llave y sin que la llave viaje al navegador. Solo atiende a la propia página y solo tres rutas: `chat/completions`, `models` y `audio/transcriptions`. |
| `api/mcp/proxy.ts` | Repite las llamadas a servidores MCP que no envían cabeceras CORS, en streaming, para que Notion, Slack o Drive respondan desde el navegador. |
| `api/oauth/proxy.ts` | Lo mismo para el descubrimiento, el registro y el canje de tokens del OAuth de MCP. |
| `api/geo.ts` | Dice en qué ciudad está la visita leyendo las cabeceras de la red de Vercel: ubicación sin permiso ni terceros. |

**Variables en Vercel** (Project → Settings → Environment Variables):

| Variable | Valor | Nota |
| --- | --- | --- |
| `GROQ_API_KEY` | `gsk_…` | Sin el prefijo `VITE_`. Si además existe `VITE_GROQ_KEY`, bórrala: esa sí acaba en el paquete del navegador. |
| `VITE_APP_ORIGIN` | `https://sky-os.cloud` | Permite identificarse ante los servidores MCP con Client ID Metadata Documents. |
| `VITE_BRIDGE_URL` | vacía | En un despliegue el puente se sirve solo, en `/api`. |
| `VITE_GOOGLE_CLIENT_ID` / `_SECRET` | opcional | Solo para Drive, Docs, Gmail y Calendar. |
| `VITE_MS_CLIENT_ID` | opcional | Solo para sincronizar con OneDrive. |

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
| Groq (por defecto) | Protocolo de OpenAI, llave incluida en `.env.local`, nunca visible en la interfaz; si no responde, Sky solo dice que está atendiendo muchas solicitudes e invita a usar una llave propia | GPT-OSS 20B para lo cotidiano; GPT-OSS 120B para tareas complejas o redacción larga. Whisper Large v3 Turbo para dictar. |
| Anthropic (Claude) | SDK oficial en el navegador | Haiku 4.5 para lo simple, Sonnet 5 para lo medio, Opus 5 para lo complejo. Lee PDF, imágenes y páginas web. |
| OpenAI, OpenRouter | Protocolo de chat completions | Modelo fijo elegido en Ajustes; lista de modelos en vivo. |
| Ollama, compatibles | Misma interfaz, URL base propia | Modelos locales sin llave. |

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
    commands.ts      registro de comandos, dispatch, diario y deshacer
    commands/        fs.*, ui.*, widgets.*, flows.*, consultas y sistema
  ai/                capa de IA neutral al proveedor
    settings.ts      proveedores (Groq, Anthropic, OpenAI, OpenRouter, Ollama), niveles de modelo
    router.ts        modelo automático por dificultad
    tools.ts         comandos → herramientas del modelo
    agent.ts         bucle de agente con streaming y runId para deshacer
    providers/       anthropic (SDK oficial), compatible con OpenAI, simulador
    context.ts       prompt de sistema con el perfil de la persona + estado del escritorio por turno
    session.ts       conversación de la barra · tasks.ts trabajos con ventana de resultado
    indexer.ts       índice y búsqueda por significado · classify.ts sugerencias al importar
    snap.ts          captura de pantalla · voice.ts dictado · terminal.ts consola
  state/             Zustand: ventanas, selección y menús, ajustes, diálogo
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
