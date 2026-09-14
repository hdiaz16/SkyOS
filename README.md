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
- Splash de arranque y onboarding en una pregunta por pantalla, con el orbe de Sky; las respuestas se integran al prompt
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

- Resumir el contenido de una carpeta sin abrir nada; transformar un archivo con vista previa antes de aplicar.
- Al importar al escritorio, la IA etiqueta y sugiere la carpeta correcta con un clic.
- Índice de resúmenes con un modelo rápido para buscar por lo que dicen los documentos.

**Ventanas inteligentes**

- Editor con copiloto: selecciona texto y pide mejorar, resumir, traducir o cualquier instrucción; Ctrl+J continúa.
- Navegador con "puntos clave" de la página (Claude lee la URL con `web_fetch`).
- Terminal en lenguaje natural que muestra cada herramienta ejecutada como un comando.

**Sistema**

- Comandos de ventanas: ordenar en cuadrícula o cascada, cerrar o minimizar las inactivas, limpiar escritorio.
- Papelera con restaurar, historial de acciones con deshacer individual y "deshacer todo" por respuesta.

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
