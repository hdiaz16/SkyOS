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

1. ~~Las cuentas verificadas siguen apagadas en producción~~ — **encendidas el 19 de septiembre (cuarta tanda)**
   con registro por contraseña: `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` puestas en Vercel (producción) desde
   la CLI, con permiso de Hector. El proyecto `kccuieiyjzddyihfqyii` tenía «Confirm email» encendido
   (`/auth/v1/settings` → `mailer_autoconfirm: false`) y desde aquí no se pudo apagar (no hay CLI de Supabase ni
   token en la máquina; el MCP de Supabase de la sesión apunta a otro proyecto, `mexzqdakiwwoxflyznnm`, y no toca la
   configuración de auth). Por eso el código lo detecta al arrancar y sigue con perfiles locales, con aviso, hasta que
   Hector lo apague en Authentication › Sign In / Providers › Email; en ese momento las cuentas quedan vivas sin
   redesplegar. Sin SMTP no hay recuperación de contraseña. Migrar al código por correo, en este orden: SMTP propio
   (Resend) → plantilla `supabase/templates/magic-link.html` → «Confirm email» encendido → `VITE_ACCOUNTS_MAIL=1` en
   Vercel → redeploy. Las cuentas con contraseña siguen valiendo después.
2. ~~El paso corto de permisos~~ — hecho en `d23625c` y corregido en la tercera tanda del 19 de septiembre (las
   respuestas del navegador se distinguían mal); **verificado** con Ana: la tarjeta a los cinco segundos, lo que el
   navegador ya decidió marcado desde el inicio, «cerrar sin responder» con Reintentar, y el cierre —a mano o solo,
   cuando todo queda concedido— que guarda la respuesta y no vuelve a molestar.
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

## Tanda del 19 de septiembre de 2026 (tercera): lo que Hector vio en la tarjeta de Spotify

- **Conectores: un clic, o la verdad.** Comprobé contra los metadatos públicos de cada servidor de autorización
  (`/.well-known/oauth-protected-resource` → `/.well-known/oauth-authorization-server`, script en el scratchpad de la
  sesión) quién registra clientes al vuelo: Dropbox, Notion (también CIMD), Evernote, Todoist (también CIMD) y Zapier
  sí; **Google, Spotify, GitHub, Slack y Box no** (ni `registration_endpoint` ni CIMD; Box, Slack y GitHub además solo
  aceptan clientes con secreto). Antes, Spotify/GitHub/Slack/Box fallaban al pulsar Conectar con «pega el client id en
  Avanzado», que es lo que Hector vio. Ahora el catálogo lo declara (`registrar`), `config.ts` lee un cliente por
  registrador (`OAUTH_CLIENTS`, `VITE_<X>_CLIENT_ID[/_SECRET]`), la tarjeta dice quién lo registra y el botón no
  promete, y Avanzado solo enseña client id/secret en las apps que lo necesitan (en las demás, solo la URL).
  `mcp/catalog.test.ts` fija quién es quién. **Verificado** en el navegador: la tarjeta de Spotify con su texto y el
  botón desactivado (título «…no tiene registrada la conexión con Spotify»), Avanzado con «Client id de Spotify
  (opcional)»; la de Notion con Conectar activo y Avanzado solo con la URL.
  **Lo que solo Hector puede hacer**: registrar los cinco clientes (consolas en `REGISTRARS`, URL de retorno
  `https://www.sky-os.cloud/oauth/callback`) y poner las variables en Vercel. Pendiente de mejora: llevar los
  `_SECRET` al relevo (`/api/oauth`) en vez del paquete. Dos avisos vistos de paso: `rube.app` no resolvió DNS desde
  esta red (curl 6), comprobar desde otra; y el gateway MCP de Spotify rechaza en CORS la cabecera `Mcp-Method` y
  `accounts.spotify.com` no publica CORS, así que Spotify va a necesitar el puente (`/api/mcp/proxy`, `/api/oauth/proxy`)
  incluso con cliente registrado.
- **Permisos.** La tarjeta de los tres permisos traducía mal lo que responde el navegador: cerrar la pregunta sin
  responder, un micrófono ausente o una posición que no llegó se marcaban «El navegador lo tiene bloqueado», sin
  botón para volver a intentar; una petición que nunca respondía dejaba la fila girando; y si se concedía todo, la
  tarjeta desaparecía sin guardar la respuesta y volvía a la siguiente entrada. Ahora `lib/permissions.ts` traduce
  cada respuesta (concedido / denegado / cerrado / falló, con su nota), `requestNotifications` no se queda colgado
  (promesa o callback, y captura), lo que el navegador ya bloqueó se muestra bloqueado desde el inicio, el título
  cuenta los permisos que quedan y, cuando todo queda concedido tras pulsar, la tarjeta se cierra sola guardando.
  `lib/permissions.test.ts` fija las traducciones. **Verificado** con Ana: en el navegador del panel, que tiene los
  tres bloqueados, la tarjeta sale con las tres notas y sin botones; con respuestas simuladas (`Notification.permission`
  «default», `permissions.query` concedido): «Un permiso, cuando quieras usarlo», Permitir → «Cerraste la pregunta sin
  responder…» + Reintentar, Reintentar con «granted» → la tarjeta se cierra sola y `permissionsOffered` queda guardado;
  tras recargar no vuelve.
- **El día en el escritorio.** Fondo «Según la hora» (`lib/daylight.ts`), el de fábrica: siete anclas (noche, alba,
  mañana = el campo de siempre, mediodía, tarde, ocaso, anochecer) colgadas del amanecer y el ocaso reales —el widget
  del clima los aprende de Open-Meteo (`daily=sunrise,sunset`) y los guarda en `mesa:sun:<usuario>`; sin ellos,
  6:30/19:30—, mezcla minuto a minuto con suavizado, la luz cálida (`blob-3`) recorre el cielo por `--sun-x/--sun-y`,
  y `@property` registra las variables para que el navegador funda los colores (1.8 s). Paleta por ancla para el tema
  claro y para el oscuro. `ui.appearance` acepta `backdrop: 'hora'` (la etiqueta dice «fondo según la hora»); Ajustes ›
  Apariencia enseña «Ahora es mediodía en el escritorio…». `lib/daylight.test.ts` fija anclas, fase más cercana,
  mezcla, el cruce de medianoche y un día nórdico. **Verificado** en el navegador con Ana: `data-backdrop="hora"` y las
  variables en línea (`#e6eef0`, sol 50 %/4 % a las 13:03), el toast de la apariencia, las paletas de 6:10, 17:40,
  19:30 y 22:30 pintadas a mano (capturas), la geometría del sol (`left` 463 px = 50,38 % × 1524 − 20vw), el tema
  oscuro en modo hora (`#0e1517`) y vuelta, el sol real de Colima guardado (6:43 / 18:53) y el fondo intacto tras
  recargar. README, `.env.example` y `package.json` (0.4.1) al día.

## Tanda del 19 de septiembre de 2026 (cuarta): cuentas en producción, por contraseña

Hector pidió prender las cuentas ya, con registro en vez de correo, migrar al SMTP después, «agregar seguridad» y
publicar. Lo que hay:

- **Dos formas de entrar** (`system/account.ts`): `entryMode()` lee `/auth/v1/settings` del proyecto al arrancar. Con
  `VITE_ACCOUNTS_MAIL=1` → código por correo (el flujo de antes, intacto). Sin él y con `mailer_autoconfirm: true` →
  contraseña (`register`, `signIn`, `changePassword`, `requestPasswordReset`). Sin él y con el proyecto exigiendo
  confirmar correos → `unavailable`: `auth.ts` sigue con perfiles locales (`accountsUnavailable`), la pantalla de
  inicio lo dice, la consola dice qué apagar, y los escritorios que ya son de una cuenta no salen en la lista local.
  `Account.emailVerified` es verdadero solo con el código.
- **Seguridad añadida**: `lib/password.ts` (mínimo 8, sin las comunes ni el propio correo, dos clases de caracteres
  si es corta, medidor de fuerza, `lockoutMs`: 30 s tras cinco fallos y doblando hasta 5 min); un solo mensaje para
  correo o contraseña incorrectos (`describeAuthError`, con los códigos de Supabase); campos con `autocomplete`
  correcto y ojo para ver la contraseña; **adopción con PIN**: un escritorio local con PIN no pasa a una cuenta con
  su mismo correo sin el PIN mientras el correo no esté verificado (`auth.enter`/`adopt`, formulario en el paso de
  adopción del onboarding); Ajustes › Cuenta muestra el correo de la cuenta y cambia la contraseña con un diálogo que
  oculta lo escrito (`PromptRequest.secret`); cabeceras en `vercel.json` (HSTS, nosniff, SAMEORIGIN, Referrer-Policy,
  Permissions-Policy). `lib/password.test.ts` y `system/account.test.ts` fijan política, espera y mensajes.
- **Bug de raíz encontrado de paso y corregido**: `PromptDialog` leía la petición del store durante la animación de
  salida, cuando ya es `null`; `request.initialValue` lanzaba dentro del render y React 19, sin frontera de error
  encima, desmontaba el escritorio entero al cerrar cualquier diálogo de texto (pantalla en blanco). La petición viaja
  ahora como prop. Los dos «initialValue» de la consola de sesiones anteriores eran esto.
- **Doble de prueba** (`tools/fake-accounts.mjs`): `/settings`, `/signup`, `/token?grant_type=password`, `/recover`,
  `PUT /user`; `FAKE_CONFIRM_EMAIL=1` simula el proyecto con confirmación encendida.
- **Verificado** con el doble en `localhost:4181` (`VITE_SUPABASE_URL=http://localhost:54321
  VITE_SUPABASE_ANON_KEY=cuentas-de-prueba npx vite build --outDir dist-fake` + `vite preview --port 4181`):
  la puerta en modo contraseña, «Es mi primera vez» → `12345678` avisa «Esa es de las primeras que probaría
  cualquiera.», `salvia-campo-2026` marca «Fuerte», crear → onboarding sin el paso del correo → escritorio (el doble
  registra `ana.prueba@example.com`); Ajustes › Cuenta con el correo y «Contraseña»: débil → aviso, fuerte →
  «Contraseña actualizada» y el doble lo anota; cerrar el diálogo ya no deja el escritorio en blanco. Salir → puerta →
  «Ya nos conocemos»: cinco contraseñas malas dan «Correo o contraseña incorrectos.» y a la quinta el botón pasa a
  «Espera 30 s» (desactivado) con la nota de que aún no hay recuperación; pasados los 30 s, la contraseña nueva entra al
  escritorio de Ana. Con el doble en `FAKE_CONFIRM_EMAIL=1`: la consola avisa qué apagar, el escritorio de Ana (ya de
  una cuenta) no sale en la lista local y se puede crear un perfil local (Beto, con PIN 1234); al salir, «Inicia sesión»
  muestra a Beto y la nota. Doble de vuelta en autoconfirmación: registrar `beto@example.com` **no** adopta el
  escritorio de Beto solo por el correo — sale la pantalla de adopción, «Abrirlo» con `9999` dice «Ese PIN no es.», con
  `1234` abre el escritorio de Beto.
- **Publicado**: `6172423` desplegado en Vercel (listo en 41 s) con `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`
  añadidas a producción desde la CLI justo antes del push. **Verificado en vivo** en sky-os.cloud: las cinco cabeceras
  llegan (`curl -I`), el paquete publicado lleva el proyecto `kccuieiyjzddyihfqyii`, la lectura de `auth/v1/settings` y
  las pantallas de contraseña; la sesión local de antes sigue entrando al escritorio (con el fondo «Según la hora» ya en
  producción); al salir, la pantalla de inicio muestra la lista local con la nota «Este SkyOS todavía no puede abrir
  cuentas…» y la consola el aviso `[cuentas]` con el interruptor a apagar. Es decir: todo listo, esperando a que Hector
  apague «Confirm email»; en ese momento la puerta de correo y contraseña aparece sola, sin redesplegar. Primer registro
  real de prueba y su borrado: cuando eso ocurra. También quedó fuera del repo `dist-local/` (175 archivos que entraron
  con `5c31e5b`), con `dist-*/` en `.gitignore`.
- **Hector apagó «Confirm email» esa misma noche** (`mailer_autoconfirm: true` desde entonces) y la puerta apareció sola
  en el sitio, sin redesplegar. **Verificado en vivo**: registro real de `prueba.skyos@example.com`, medidor «Fuerte»,
  pantalla de adopción con el perfil local de prueba del panel ofrecido, «No es mío, quiero uno nuevo», onboarding sin
  el paso del correo, escritorio «Buenas noches, Prueba», y Ajustes › Cuenta con el correo y el botón «Contraseña». Ese
  usuario de prueba vive en Authentication › Users del proyecto; se puede borrar cuando se quiera.
- **La IA incluida nunca había llegado al sitio publicado** (`api/ai`): Vercel enruta `api/ai/[...path].ts` como un solo
  segmento (`^/api/ai/([^/]+)$`, visto con `vercel build` en local), así que `/api/ai/chat/completions` y
  `/api/ai/audio/transcriptions` devolvían el NOT_FOUND de la plataforma —la consola del sitio lo enseñaba en cada
  carga— y el escritorio publicado solo respondía con una llave propia. El manejador vive ahora en `api/_lib/ai.ts` y
  cada ruta real tiene su archivo de función edge (`api/ai/chat/completions.ts`, `api/ai/audio/transcriptions.ts`); el
  catch-all sigue para `models` y `proxy`. Las URL de despliegue `*.vercel.app` piden autenticación de Vercel, así que
  las comprobaciones en vivo van contra `www.sky-os.cloud`. **Verificado en vivo** tras `dcf8e14`: `POST
  /api/ai/chat/completions` con `openai/gpt-oss-20b` responde 200 desde Groq (95 tokens), `audio/transcriptions` llega a
  Groq (400 por no ser multipart, ya no NOT_FOUND), `models` 200, y sin `Origin` sigue siendo 403. Nota: la llave
  incluida ya no tiene los modelos `llama-3.x`; el catálogo del escritorio se lee de `/api/ai/models`, así que no hay
  nada que tocar.
