# Continuar el pulido de SkyOS

Este archivo es el relevo: lo que se hizo, lo que falta y cómo se trabaja aquí. Si eres un agente que acaba de
llegar a este repositorio, léelo entero antes de tocar nada y sigue el método tal cual: no es ceremonia, es lo
que hace que cada arreglo se pueda verificar y contar.

## Qué es esto

SkyOS es un escritorio web donde vive Sky, una asistente. Vite 8 + React 19 + TypeScript 6, Tailwind 4,
Zustand 5, Dexie (IndexedDB) y OPFS para los archivos, Motion para el movimiento. Todo corre en el navegador:
no hay servidor propio salvo unas funciones edge en `api/` (el relevo del modelo y el puente CORS de MCP).

El código está escrito a mano y con cuidado: **nunca pases prettier ni reformatees archivos completos**.
Los comentarios explican *qué pasaba*, no qué hace la línea.

## Dónde estamos

Una auditoría archivo por archivo, hecha en septiembre de 2026, encontró 186 problemas concretos —cada uno con
un caso que alguien puede vivir usando el escritorio, no un olor de código. Viven en
[`hallazgos.json`](hallazgos.json) y el marcador está en [`README.md`](README.md).

| Severidad | Total | Resueltas | Pendientes |
| --- | --- | --- | --- |
| Alta | 53 | 46 | **7** (arregladas en el código, esperan verificación en el navegador) |
| Media | 105 | 105 | 0 |
| Baja | 28 | 2 | **26** |

### Las 7 altas que faltan

Todas tienen su arreglo comprometido en git; lo que falta es ver cada caso en el navegador. La tabla dice
dónde vivía cada problema; la receta de verificación está en la lista de la tanda, más abajo.

| # | Dónde | Qué pasaba |
| --- | --- | --- |
| 18 | `apps/Browser.tsx:46` | La barra de direcciones solo cambia cuando Sky navega: al navegar dentro de la página, el sistema sigue creyendo que estás en la anterior. |
| 23 | `apps/Settings.tsx:569` | «N archivos con huella» lee un contador en memoria que arranca en cero: dice 0 sobre un índice lleno. |
| 26 | `mcp/manager.ts:412` | `resumeRedirect` llama a `mcp.connect`, que puede volver a pedir autorización en un momento no interactivo. |
| 32 | `components/AssistantPanel.tsx:113` | El vacío del panel promete arrastrar un archivo ahí; no existe esa zona de soltada. |
| 45 | `commands/widgets.ts:67` | `widgets.create` no valida la configuración por tipo: un widget puede nacer roto. |
| 46 | `commands/canvas.ts:38` | `parseCanvas` convierte lo ilegible en un lienzo vacío, que luego se guarda encima del original. |
| 50 | `ai/tasks.ts:378` | `transformFile` corta a 60 000 caracteres sin marcar el corte, y «Aplicar al archivo» escribe el resultado truncado. |

Las 26 bajas están en `hallazgos.json` bajo la clave `baja`; las dos primeras (el zoom del visor de PDF en
sus extremos, el mensaje del lienzo vacío) ya están cerradas.

## Cómo se trabaja

**Por archivo, no por severidad.** Se leen todos los hallazgos de un archivo, se arreglan juntos y se verifica.
Para leerlos:

```bash
node -e "const d=require('./docs/auditoria/hallazgos.json');for(const h of d.alta){if(!h.archivo.includes('SheetEditor'))continue;console.log(h.linea,h.problema,'\n→',h.arreglo,'\n')}"
```

**Las ediciones se aplican con scripts de perl** que reemplazan bloques exactos (uno y solo un match, o el
script muere). Se escriben en el scratchpad con la herramienta Write —no con heredocs de bash, que se rompen
con los apóstrofos— y se corren desde la raíz del proyecto:

```bash
perl -CSD -Mutf8 <ruta-del-script>.pl
```

**La verificación, en este orden y siempre:**

```bash
npx tsc -b
```

`npx tsc --noEmit` **no comprueba nada**: el tsconfig de la raíz es un archivo de solución con `files: []` y
referencias. El que sirve es `tsc -b`, que es lo que corre `npm run build`.

```bash
npx oxlint src
npm test
npm run build
```

Y después, en el navegador: `.claude/launch.json` ya trae la configuración `mesa`; el escritorio expone
`window.mesa` en desarrollo (`dispatch`, `execute`, `fs`, `widgets`, `useWindows`, `useUi`, `useJournal`,
`ai.useSession`…), que es la forma rápida de montar un caso y medirlo.

**Con perfiles sintéticos, nunca con la cuenta real de Hector.** Su escritorio vive en `127.0.0.1:5173`;
`localhost:5173` es otro origen y ahí están los perfiles de prueba (Ana, Beto). No los mezcles.

**Un commit por tema**, con mensaje en español que cuente qué pasaba antes. Los de esta tanda sirven de
ejemplo: `git log --oneline -14`.

## Reglas de producto que Hector ha dejado claras

- **No agregar features.** Esto es pulido: lo que hay, bien hecho.
- **Nada de afirmaciones absolutas** («todo se puede deshacer», «aislamiento total», «seguridad robusta») sin
  delimitar y demostrar qué cubren.
- **Un aviso nunca se explica por lo que casi pasa.** La pantalla de sesión decía que se detuvo «para no
  mezclar la información de dos personas»: se lee como un accidente que estuvo a punto de ocurrir. Di lo que
  pasó y qué hacer.
- **Lo que se recorta, se dice.** Si solo viajaron 400 filas, el resumen no puede sonar a que las vio todas.
- **Se arranca siempre en tema claro**, y un escritorio nuevo empieza vacío salvo el widget del clima.
- **No despliegues, no publiques, no conectes cuentas personales ni toques servicios externos** sin que Hector
  lo pida explícitamente. Para validar integraciones: datos sintéticos y entorno local.

## Pendientes que no son de la auditoría

1. **Las cuentas no están encendidas en producción.** La puerta de correo + código con Supabase está completa
   en el código (`src/system/account.ts`, `src/components/system/AccountGate.tsx`), pero
   `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` nunca se pusieron en Vercel, así que `accountsEnabled` es
   falso en el despliegue y cae a perfiles locales. **Encenderlas sin SMTP propio deja fuera a todo el mundo
   menos a Hector**: el mailer por defecto de Supabase solo escribe al dueño del proyecto. El orden correcto es
   conectar Resend (o el SMTP que él elija), pegar la plantilla de `supabase/templates/magic-link.html`, y
   entonces sí las variables.
2. **El paso corto de permisos** después de entrar (micrófono, ubicación, notificaciones) sigue sin existir.
3. **Las 28 bajas** de la auditoría.

## Lo que se hizo en esta tanda (septiembre de 2026)

Los 105 hallazgos de severidad media, en seis commits temáticos. En una línea cada uno:

- `1a116f1` el navegador y la terminal dejan de fingir (direcciones que no lo son, sitios que no se enmarcan,
  escribir mientras algo corre, `clear` que limpia de verdad).
- `2e11f15` las apps conectadas hablan claro cuando algo se rompe (estado de atención, mensajes para personas y
  no para el modelo, desconectar que no se cuelga, los dos flujos de OAuth que se robaban la respuesta).
- `b1ccb50` la conversación sobrevive a la recarga y la voz se calla cuando debe.
- `6bf8579` lo que seleccionas es de donde lo seleccionaste (selección por superficie, Mayús+clic, arrastre).
- `639a006` los widgets se quedan donde se alcanzan.
- `067bdf7` lo que no se puede deshacer lo dice, y lo que se perdió no se borra solo.

Después del relevo, la tanda que sigue:

- `b8266c5` un PDF grande deja de montar todas sus páginas (alta 11, baja 39 del mismo archivo).
- `af52eb8` guardar una hoja escribe sobre el libro, no lo reconstruye (altas 6 y 8).
- `22e8308` el lienzo manual entra al bus: quitar y editar se pueden deshacer (alta 17, baja 132).
- `49897cb` el navegador dice la verdad cuando la página navega sola (alta 18) — **verificación en el
  navegador pendiente**: abrir el Navegador, navegar dentro de la página y ver la barra atenuada y el pie
  honesto; luego Recargar y confirmar que vuelve a la dirección conocida.
- `99d9150` los archivos con huella se cuentan, no se recuerdan (alta 23) — **verificación pendiente**: con
  archivos ya indexados, abrir Ajustes › Inteligencia y ver que el número no dice 0.
- `6b01030` volver de autorizar ya no puede abrir otra autorización (alta 26) — **verificación pendiente**:
  con un servidor que siga devolviendo 401 a tools/list aun con el token recién concedido, la tarjeta pasa a
  pedir atención y el toast dice reintentar desde Apps conectadas, sin sacar la pestaña al consentimiento
  otra vez.
- `6a4b8dd` soltar un archivo en el panel de Sky ya no se sale del escritorio (alta 32) — **verificación
  pendiente**: con la conversación abierta, arrastrar un archivo del sistema sobre el panel: se marca como
  zona de soltada, al soltar el archivo aterriza en el escritorio y queda esperando en la barra; la pestaña
  no navega al archivo.
- `6d17d10` un widget ya no puede nacer roto de una config mal escrita (alta 45) — **verificación pendiente**:
  pedirle a Sky «ponme un temporizador de 10 minutos»: o llega con seconds 600, o Sky cuenta que lo rechazó
  con la forma esperada; nunca un widget confirmando 10 minutos mientras marca 25:00. Ítem «dólar a pesos
  argentinos»: rechazado con la lista de monedas, no un widget diciendo «Moneda no disponible».
- `7f8e7ee` un lienzo que no se puede leer ya no se abre en blanco (alta 46) — **verificación pendiente**:
  renombrar un .txt a .canvas y pedirle a Sky que añada un diagrama ahí: dice que no pudo leerlo y no escribe
  nada encima; el archivo queda igual. El editor lo abre en su pantalla de «No pude leer este lienzo».
- `bc2097d` transformar un archivo ya no borra lo que no cupo (alta 50) — **verificación pendiente**: con una
  nota de más de 60 000 caracteres, traducirla: el pie dice cuántos caracteres del final no se leyeron,
  «Aplicar al archivo» queda apagado con la explicación y «Guardar como copia» es el botón principal.

Antes de eso, en la misma línea de trabajo: `94655aa` (los editores dejan de pisarse a sí mismos),
`fbe3e70` (barra, ajustes y panel), `012c65e` (ventanas), `a767571` (lienzo y tareas).
