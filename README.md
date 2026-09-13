# Sky

Sky es un escritorio web tranquilo, inspirado en la naturaleza, donde la inteligencia artificial es la protagonista.
Escritorio, carpetas y ventanas como metáfora visual; una barra siempre visible como punto de entrada para pedir,
buscar y navegar.

**Estado: fase 1 completa.** Funciona en local, todo se guarda en el navegador. Con una llave de Anthropic (o un
proveedor compatible con OpenAI, incluido Ollama) la IA actúa sobre el escritorio.

## Correr en local

```bash
npm install
npm run dev
```

Abre `http://localhost:5173` en Chrome o Edge. En Ajustes › Inteligencia pega tu llave; se guarda solo en tu navegador.

## Qué hace

**Escritorio**

- Íconos, carpetas anidadas, ventanas arrastrables, dock integrado en la barra, saludo y reloj con calendario.
- Widgets útiles: clima (Open-Meteo), divisas (BCE), recientes, reloj mundial, tareas, nota, temporizador. La IA
  puede crear widgets propios en HTML dentro de un marco aislado.
- Fondo con gradientes, colinas y luz que deriva; modo claro y noche.

**Barra de Mesa** (Ctrl+K)

- Pide cosas en lenguaje natural: la IA usa los mismos comandos que la interfaz y todo queda deshacible.
- Busca archivos por nombre o por significado, ejecuta acciones, lanza flujos guardados y abre Google.
- Calculadora y conversor local: `15% de 3400`, `120 km a millas`, `72 f a c`, `2 gb en mb`.
- Captura de pantalla con selector de área para pedir cosas sobre lo que ves.

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

## Arquitectura

```
src/
  kernel/            núcleo sin UI
    fs.ts            sistema de archivos (OPFS + Dexie)
    widgets.ts       widgets persistidos
    flows.ts         rutinas guardadas
    commands.ts      registro de comandos, dispatch, diario y deshacer
    commands/        fs.*, ui.*, widgets.*, flows.*, consultas y sistema
  ai/                capa de IA neutral al proveedor
    types.ts         mensajes, partes, herramientas, eventos de stream
    tools.ts         comandos → herramientas del modelo (esquema JSON desde los parámetros)
    agent.ts         bucle de agente con streaming y runId para deshacer
    providers/       anthropic (SDK oficial), compatible con OpenAI, simulador
    context.ts       prompt de sistema cacheable + estado del escritorio por turno
    session.ts       conversación de la barra · tasks.ts trabajos con ventana de resultado
    indexer.ts       índice y búsqueda por significado · classify.ts sugerencias al importar
    snap.ts          captura de pantalla · terminal.ts consola
  state/             Zustand: ventanas, selección y menús, ajustes, diálogo
  components/        escritorio, barra, panel de Mesa, ventanas, widgets, apps
  lib/               calculadora, unidades, clima, divisas, menús, utilidades
```

**El bus de comandos es la pieza central.** Botones, menús, la barra y la IA llaman exactamente los mismos comandos.
Cada comando declara sus parámetros con una descripción legible (esa descripción es la documentación que recibe el
modelo) y devuelve una función de deshacer. La IA nunca puede hacer algo que la persona no pueda revertir.

## Proveedores de IA

| Proveedor | Cómo | Notas |
| --- | --- | --- |
| Anthropic (Claude) | SDK oficial en el navegador, llave local | Recomendado. Opus 5 por defecto; Haiku 4.5 para índice y clasificación. Lectura de páginas con `web_fetch`, PDF e imágenes. |
| OpenAI, OpenRouter | Protocolo de chat completions | Herramientas e imágenes; sin lectura de PDF ni páginas. |
| Ollama, compatibles | Misma interfaz, URL base propia | Modelos locales sin llave. |

## Siguiente fase

Cuentas y sincronización en la nube cambiando el adaptador de almacenamiento, montar una carpeta real del disco,
exportar todo, PWA.

## Stack

Vite · React 19 · TypeScript · Tailwind 4 · Motion · Zustand · Dexie · OPFS · SDK de Anthropic
