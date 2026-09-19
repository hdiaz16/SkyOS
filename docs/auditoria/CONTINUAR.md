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
| Alta | 53 | 53 | **0** (7 arregladas en el código, esperan verificación en el navegador) |
| Media | 105 | 105 | 0 |
| Baja | 28 | 28 | **0** (las 26 de la última tanda esperan verificación en el navegador) |

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

Las 26 bajas restantes se cerraron en la tanda del 19 de septiembre (ver abajo); sus recetas de verificación
acompañan a cada commit. Las dos primeras (el zoom del visor de PDF en sus extremos, el mensaje del lienzo
vacío) se cerraron antes con `b8266c5`.

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

1. **Las cuentas verificadas siguen apagadas en producción**, y mientras tanto el escritorio se registra en el
   onboarding (nombre, correo, PIN opcional) y se vuelve a entrar con el correo desde la pantalla de inicio
   (`5c31e5b`). La puerta de Supabase está completa en el código (`src/system/account.ts`,
   `src/components/system/AccountGate.tsx`), pero `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` nunca se
   pusieron en Vercel. **Encenderlas sin SMTP propio deja fuera a todo el mundo menos a Hector**: el mailer por
   defecto de Supabase solo escribe al dueño del proyecto. El orden correcto es conectar Resend (o el SMTP que él
   elija), pegar la plantilla de `supabase/templates/magic-link.html`, y entonces sí las variables. Al adoptar un
   escritorio local, el correo registrado es el que casa con la cuenta.
2. ~~El paso corto de permisos~~ — hecho en `d23625c` (micrófono, ubicación, notificaciones; **verificación
   pendiente**: entrar con un perfil que no los haya ofrecido aún y ver la tarjeta a los cinco segundos, con
   sus tres filas, lo ya concedido marcado y el cierre que no vuelve a molestar).
3. ~~Las 28 bajas~~ de la auditoría — hechas: las 2 primeras en `b8266c5`, las 26 restantes en la tanda del
   19 de septiembre; todas en verificación.

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
- `d23625c` al entrar, el escritorio ofrece sus tres permisos de una vez (pendiente fuera de la auditoría) —
  **verificación pendiente**: con un perfil que aún no los haya ofrecido, la tarjeta aparece unos cinco
  segundos después de entrar; cada fila concede lo suyo, lo ya concedido no se ofrece, lo rechazado dice
  dónde se cambia, y al cerrarla no vuelve a aparecer. Con la pestaña en segundo plano, un trabajo de fondo
  que termina avisa por notificación y el clic devuelve el escritorio.

Después del relevo, pedidos de Hector fuera de la auditoría:

- `f72d872` GLM de Z.ai como proveedor, sin un solo modelo escrito aquí: la lista se le pide a su API al pegar
  la llave y los escalones (económico → capaz) se leen de lo que devuelva ese día. **Verificación pendiente**:
  pegar una llave de Z.ai en Ajustes › Inteligencia y ver la lista llegar sola; «Automático» arranca en el
  Flash (gratis) y «resume esto» sube al modelo completo.
- `1f155cb` la voz de ElevenLabs, con la voz y el modelo que cada quien elija de los que su cuenta trae.
  **Verificación pendiente**: pegar la llave en Ajustes › Apariencia › La voz de Sky, elegir voz y modelo,
  «Escúchala»; y que la llave viva en la cuenta (entrar con otro perfil y no verla).
- `1217602` los modelos de visión de GLM: con una imagen adjunta y «Automático», la petición cambia al
  `-v` más nuevo de la lista viva (`inferVisionModel` en settings.ts, cambio en router.ts); el preset GLM
  declara `vision: true` y los `-v` siguen fuera de los tiers. **Verificación pendiente**: con GLM
  configurado, adjuntar una imagen y preguntar qué hay en ella: la petición viaja a glm-4.5v (o el más nuevo
  que sirva ese día); sin imagen, sigue el Flash como siempre.
- (esta tanda) el modelo más barato carga lo cotidiano: `inferTiers` toma el marcador económico más nuevo de
  la lista (Air, Flash, Mini…) para los escalones rápido y equilibrado, y solo lo de verdad difícil sube al
  modelo completo. Los nombres son lo único que un cliente ve — los precios reales no viajan en la lista —
  así que el marcador es la apuesta honesta por «barato». Quien quiera un modelo fijo, lo elige a mano en
  Ajustes. **Verificación pendiente**: con la llave pegada, «pon un temporizador» y «resume esto»: el primero
  viaja al marcador barato y el segundo al completo.
- (esta tanda) la búsqueda por significado en el dispositivo apagada por defecto: el modelo local son ~120 MB
  de descarga y CPU de fondo que nadie pidió al entrar. Se enciende con su interruptor en Ajustes ›
  Inteligencia; quien ya lo usaba, lo vuelve a prender una vez y queda. **Verificación pendiente**: en una
  instalación limpia, la red no descarga el modelo al arranque y Ajustes lo muestra «Desactivada».
- `dd23033` GLM puede hablar: Z.ai responde el preflight sin cabeceras CORS, así que una página nunca pudo
  llamarlo directo — y el aviso culpaba a la red. Ahora el puente lleva IA (`/ai/proxy`, streaming, la llave
  de la persona viaja en el Authorization) y GLM va por él cuando `VITE_BRIDGE_URL` lo nombra; sin puente, el
  aviso dice lo que pasó y dónde está el detalle. **Verificación pendiente**: con el puente corriendo y
  `VITE_BRIDGE_URL=http://127.0.0.1:8787`, pegar la llave de Z.ai: la lista de modelos llega y una conversación
  fluye token a token; sin el puente, el aviso dice «no acepta llamadas directas desde un navegador».

Antes de eso, en la misma línea de trabajo: `94655aa` (los editores dejan de pisarse a sí mismos),
`fbe3e70` (barra, ajustes y panel), `012c65e` (ventanas), `a767571` (lienzo y tareas).

## Las 26 bajas (tanda del 19 de septiembre de 2026)

Siete commits temáticos, todos **con verificación en el navegador pendiente**. La receta va con cada uno:

- `49ee534` el renombrado pertenece a la superficie que lo pidió — **verificar**: abrir Archivos en el
  escritorio, seleccionar un icono del escritorio y pulsar F2: solo el escritorio abre el campo, la ventana
  no; renombrar con un editor autoguardando en la misma carpeta y ver que el cursor no salta; arrastrar
  despacio sobre una carpeta (del icono a la etiqueta) sin que el anillo parpadee; en Archivos, el botón
  dice «Subir» y sube un nivel.
- `d70cdf1` los menús de selección aparecen aunque sueltes fuera y se retiran al usarse — **verificar**: en
  un documento, seleccionar arrastrando hacia abajo y soltar fuera del borde de la ventana: el menú aparece;
  en una hoja, seleccionar un rango, hacer scroll: el menú se oculta, y al pedir «Resumir» se cierra.
- `e86a0bc` los visores cuentan lo que pasó — **verificar**: una respuesta con valla ``` sin lenguaje se pinta
  como bloque, sin recuadro dentro del recuadro; una imagen aún cargando muestra el pie sin separador suelto;
  un archivo de Office que no abre dice «No pude abrir este archivo ahora mismo» y el detalle queda en consola;
  un diagrama que falló porque la red se cortó se reintenta al llegar el siguiente.
- `3549428` lo que se corta se dice — **verificar**: en la terminal, pedir algo largo y Ctrl+C a mitad de
  respuesta: aparece «(detenido)» aunque hubiera texto; en la barra, «5/0» ya no responde «= ∞».
- `188afb4` deshacer un movimiento devuelve también el nombre — **verificar**: mover «notas.md» a una carpeta
  que ya tiene uno igual (se vuelve «notas 2.md»), Ctrl+Z: vuelve con su nombre original; restaurar desde la
  papelera un archivo cuya carpeta también está en la papelera: el toast dice que cayó en el Escritorio;
  vaciar la papelera dice «N elementos eliminados para siempre».
- `e8e6c6e` el diario y los avisos dicen lo que pasó — **verificar**: pedirle a Sky «sincroniza» con nube
  conectada: entra en «Lo que hice» marcada «En la app»; Ctrl+Mayús+Z con una sola ventana abierta: toast y
  sin entrada nueva en el diario; en un resultado de transformación, mandar el archivo a la papelera y pulsar
  «Aplicar al archivo»: dice que está en la papelera, no «Aplicado»; en Almacenamiento con la nube elegida
  desconectada: «La nube ya no está conectada» manda sobre «Última vez…», y un «hace 3 días» se lee en días.
- `a42b682` widgets, calendario y orillas — **verificar**: pedirle a Sky «pon el widget de divisas en 500
  dólares»: la caja muestra 500; escribir en una nota de widget y recargar dentro de medio segundo: la nota
  conserva lo último escrito; los días del calendario no se iluminan como botones; una ventana se estira
  desde los cuatro bordes y las cuatro esquinas, y el mínimo se respeta estirando desde arriba o la izquierda.

## Tanda del 19 de septiembre de 2026 (segunda): lo que Hector pidió tras el análisis del estado

- `df736fb` **herramientas por proveedor**: el manual entero, en orden fijo, donde el prefijo se cachea
  (Anthropic); una selección compacta —lo que la petición pide, un núcleo y una herramienta de búsqueda, nunca más
  del tope ni nunca cero— donde se mide por minuto (Groq) o se cachea a mitad de precio (compatibles con OpenAI).
  La conversación también se cachea en Anthropic. **Verificado**: «pon un temporizador de 10 minutos» en Groq viajó
  con 12 herramientas (5 KB), 6 472 tokens de entrada en dos solicitudes.
- `91f6bff` **GLM en producción**: `/api/ai/proxy` repite la petición con la llave de la persona, solo hacia Z.ai
  (`AI_RELAY_HOSTS` amplía). **Verificado** con el manejador real: 403/400/400 y la petición llegando a Z.ai.
  Pendiente en vivo: pegar una llave de Z.ai en el sitio publicado y ver la lista de modelos llegar.
- `25edca1` **widgets anclados y apariencia**: `anchorRight` en el widget, pin en el marco, la rejilla del
  escritorio deja libre la columna anclada; `widgets.place` y `ui.appearance` (tema, acento, fondo) con inversas
  escritas; Ajustes › Apariencia con acentos y fondos. **Verificado** en el navegador.
- `9b0f9e8` **selección por rectángulo y menú de varios**: `lib/marquee.ts`; agrupar (`fs.group`/`fs.ungroup`),
  etiquetar, propiedades (diálogo `info`), abrir todos. **Verificado** en el navegador.
- `5c31e5b` **registro local**: paso «¿Con qué correo te reconozco?» (correo + PIN opcional) y «Entrar con mi
  correo» en la pantalla de inicio. **Verificado** en una compilación sin cuentas servida en `localhost:4180`
  (`VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= npx vite build --outDir dist-local`, luego `vite preview`).
- `0c4e22a` **conectar es un clic**: la tarjeta de Google ya no pide un client id; dice que lo registra quien
  administra la instalación y el botón no promete. **Verificado** en el navegador.
- README, SECURITY y `package.json` (0.4.0) al día con GLM, ElevenLabs, el relevo de IA, el registro local y la
  selección.

**Lo que decidí y por qué, por si se quiere revisar**: el trabajo sin commit que había en `ai/tools.ts`
(enrutado por dominio con tope de 15) iba en contra del commit anterior (`3f18071`, superficie constante para
la caché). Ninguno de los dos era correcto para todos los proveedores; la respuesta es por proveedor, con los
números medidos en el propio escritorio. `ai/tools.test.ts` fija ambas mitades.
