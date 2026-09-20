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

## Tanda del 19 de septiembre de 2026 (quinta): permisos con interruptores, galería de widgets, Groq en vivo

- **Permisos como interruptores** (`components/system/PermissionSwitches.tsx`, compartido por la tarjeta de entrada y
  Ajustes › Cuenta): tres interruptores independientes y uno general («Todo») que pide los tres uno por uno. Encendido
  es «Sky pide al navegador una vez y lo usa»; apagado es «Sky deja de usarlo aunque el navegador lo siga
  permitiendo», y la nota lo dice, porque una página no puede devolver un permiso. La preferencia vive en
  `profile.permissions` (`system/db.ts`); la respetan las notificaciones de trabajos (`system/jobs.ts`), el botón de
  dictado (`CommandBar`) y el widget del clima, que con la ubicación apagada ni pregunta ni vuelve a guardar el lugar.
  Lo que el navegador ya bloqueó sale bloqueado y deshabilitado. `components/Switch.tsx` es el interruptor del sistema.
- **Bug de raíz de paso**: `users.updateProfile` escribía el perfil entero a partir de la copia que tuviera quien
  llamaba, así que dos escritores a la vez —el widget del clima guardando el lugar y los interruptores guardando una
  respuesta— se borraban campos. Ahora cambia solo sus campos leyendo la fila dentro de su transacción, y un
  `undefined` borra la clave. Los seis llamadores dejaron de pasar la copia.
- **Galería de widgets** (`components/WidgetGallery.tsx`): botón «Widgets» en la barra, junto al audio de enfoque: los
  siete tipos con su descripción y un toque para ponerlos en el escritorio, y «Otro, a tu medida», que deja en la barra
  «Hazme un widget que…» para que Sky lo construya en HTML. Siguen valiendo el clic derecho y escribir «widget».
- **Groq como IA por defecto, verificado en vivo**: en sky-os.cloud, con la cuenta de prueba, «Dime hola en una frase
  corta» → «¡Hola! He dicho hola. GPT-OSS 20B · equilibrado · 1.5k tokens · 2.4 s» por `/api/ai/chat/completions`. El
  preset de Groq ya no nombra los `llama-3.x` retirados; los niveles automáticos van a `openai/gpt-oss-20b` y
  `openai/gpt-oss-120b`, y `groq/compound-mini` está marcado sin herramientas.
- **Verificado** en `localhost:5173` con Ana y respuestas simuladas del navegador: la tarjeta con «Todo» y tres
  interruptores; «Todo» encendido → los tres concedidos, lugar guardado, tarjeta cerrada y `permissionsOffered`; «Todo»
  apagado desde Ajustes → los tres en `false`, la ubicación exacta borrada y el clima siguiendo por red sin volver a
  guardarla; «Notificaciones» sola encendida → solo esa en `true`. Galería: los siete tipos listados, «Reloj mundial»
  puesto en el escritorio con su aviso, y «Otro, a tu medida» dejando «Hazme un widget que » en la barra con el foco.
  Nota para probar en el panel: `key Return` y los clics por `ref` no siempre llegan a los formularios de React; un
  `form.requestSubmit()` o un `element.click()` desde JS sí.
- **Los widgets brincaban al redimensionar** (lo vio Hector): `WidgetFrame` conservaba la geometría viva del último
  arrastre hasta que la guardada coincidiera exactamente con ella, cosa que para un widget anclado el redimensionar
  hacía imposible; así que un widget arrastrado alguna vez volvía a ese sitio viejo en cada cambio de tamaño en vez
  de seguir el borde. La geometría viva ahora se suelta en cuanto cambia la fila del widget o el ancho de la ventana
  sin nadie arrastrando. **Verificado** en `localhost:5173`: arrastrar el clima anclado, cambiar el ancho del panel y
  ver su borde derecho a la misma distancia del borde en los dos anchos.

## Tanda del 19 de septiembre de 2026 (sexta): lo que Hector vio en el sitio

- **Atrás se queda dentro** (`system/back.ts`, `trapBack()` en `main.tsx`): la página guarda un paso propio en el
  historial del navegador; el botón Atrás del ratón, Alt+← o el gesto caen en ese paso, se vuelve a poner, y la
  pulsación se ofrece a quien la quiera (`onBack`). El Navegador (`Browser.tsx`) la toma cuando es la ventana de
  arriba y vuelve a la dirección anterior de esa ventana; si no hay nadie, no pasa nada. Antes salía del sitio o lo
  recargaba. **Verificado**: `history.back()` deja la página en su sitio y rearmada; con el Navegador arriba,
  dos → uno → la página de inicio.
- **Los widgets se movían al redimensionar y no volvían**: el marco guardaba en la base la posición recortada a la
  ventana en cada `resize`; un panel estrecho un instante (280 px al ocultarse) dejó a los tres widgets de Ana en
  `x: 208` para siempre. Ahora el recorte es solo visual: `inside(placed(...), viewport)` al pintar, y nada se escribe
  salvo por un arrastre de la persona. **Verificado**: 900×600 → filas intactas → tamaño normal → filas intactas.
- **Interruptores de permisos que «no funcionaban»**: en el navegador de Hector los tres están bloqueados por el
  propio navegador, y un interruptor deshabilitado se lee como un botón roto. Ahora un interruptor bloqueado sigue
  respondiendo —al pulsarlo, un aviso dice cómo se desbloquea desde el candado— y «Todo» avisa cuáles están
  bloqueados; además, una pregunta que el navegador nunca muestra (Chrome silencia los avisos en sitios donde se
  cerraron antes) deja de girar a los 25 s con una nota que dice dónde está el icono. **Verificado** en el panel, que
  tiene los tres bloqueados: aviso «Notificaciones: El navegador lo tiene bloqueado…» y el de «Todo».
- **Conectar en Spotify parecía roto**: el botón deshabilitado ya no existe; pulsarlo abre un diálogo con lo que falta
  (consola de Spotify, URL de retorno, `VITE_SPOTIFY_CLIENT_ID` en Vercel) y un botón para abrir la consola. Sigue
  siendo trabajo de Hector: registrar el cliente y poner la variable. **Verificado** en el navegador.
- **El día en el escritorio no se veía**: las paletas del tema claro eran tan cercanas al papel de la mañana que a las
  19:50 el fondo era gris claro. Nuevas paletas con color de verdad en la luz, el cielo y las colinas —alba rosa y
  durazno, mediodía azul, tarde dorada, ocaso naranja y rosa, anochecer índigo y violeta, noche pizarra bajo la luna—
  con el papel aún claro para la tinta; el tema oscuro también gana contraste por hora. `daylight.test.ts` sigue
  fijando la mañana en el campo. **Verificado** a las 19:58 en `localhost:5173`: el escritorio en lavanda e índigo.
- Hector: el SMTP se deja por ahora y las cuentas siguen por registro con contraseña.

## Tanda del 19 de septiembre de 2026 (séptima): el alta de las apps sin mostrarle nada a nadie

- **Nadie ve client id, secreto ni URL del MCP.** Hector vio esos campos en Avanzado y los leyó como algo que cada
  persona tendría que hacer. Avanzado existe ahora solo para los servidores agregados por URL (su dirección y quitarlo);
  las apps del catálogo no tienen Avanzado. La tarjeta de una app sin alta dice «Todavía no está disponible aquí… cuando
  lo esté, entrarás con tu propia cuenta»; Conectar abre un diálogo con esa misma idea y un botón «Ver los pasos» hacia
  el README (sección Apps conectadas), donde están las instrucciones para quien administra. `manualClient` sigue en el
  modelo (un cliente pegado antes sigue valiendo) pero ya no tiene interfaz.
- **El secreto nunca llega al navegador.** `config.ts` ya no lee ningún `VITE_…_CLIENT_SECRET`. El relevo
  `/api/oauth/proxy` (`withClientSecret` en `api/_lib/relay.ts`) añade el secreto del despliegue al canje del código
  —solo para los servidores de tokens de GitHub, Slack, Box, Google y Spotify, solo si el `client_id` es el del
  despliegue y solo si la petición no traía uno— leyendo `GITHUB_CLIENT_SECRET`, etc. (sin VITE_), y de respaldo el
  `VITE_…_SECRET` que un despliegue anterior dejara, así que el `VITE_GOOGLE_CLIENT_SECRET` que ya está en Vercel sigue
  sirviendo sin migrar nada. El escritorio (`auth.ts tokenRequest`) manda esos canjes por el relevo a propósito, no
  solo cuando falla CORS. `relay.test.ts` fija cuándo se añade y cuándo no. **Pendiente**: el puente local (`bridge/`)
  no inyecta secretos todavía; para probar GitHub en local hay que pasar por producción o añadir la misma regla a
  `bridge/src/proxy.ts`.
- **Spotify tras conceder el permiso**: Hector concedió el permiso y el gateway respondió 401 al primer uso (el aviso
  «sigue pidiendo autorización aunque acabas de concedérsela»). El texto ahora incluye la razón que da el servidor
  (`error_description`) para saber si es un cliente no admitido en el piloto, un scope o el token. Lo comprobado sin
  cuenta: el PRM de Spotify publica ocho scopes y se piden todos; el gateway solo acepta en CORS `client-token, origin,
  content-type, accept`, así que en producción la llamada MCP va por `/api/mcp/proxy`; con un token inválido responde
  `error="invalid_token"`. Lo que no se pudo comprobar: si el «external pilot» acepta clientes en modo desarrollo. La
  próxima vez que Hector lo intente, el aviso dirá la razón.
- **Seleccionar texto**: el escritorio tenía `user-select: none` en todo el cuerpo y no se podía copiar nada, ni de un
  diálogo ni de Ajustes. Las ventanas (`WindowFrame`) y el diálogo (`PromptDialog`) llevan `select-text`; el
  escritorio, los iconos y la barra siguen sin selección.

- **Spotify cambió las reglas** (aviso del 6 de febrero de 2026, vigente desde el 11): un cliente en modo desarrollo
  exige cuenta Premium, es uno por desarrollador, admite hasta cinco personas autorizadas a mano y menos endpoints
  (búsqueda con límite 10, listas, biblioteca unificada, reproducción, perfil y top; se fueron los «varios»,
  novedades, categorías y seguir); la cuota extendida es solo para empresas con 250 000 usuarios al mes. `REGISTRARS`
  lo declara en `limit` y la tarjeta y el diálogo de Spotify ya no dicen «para todo el mundo». Para SkyOS, Spotify solo
  puede ser un conector personal (Hector y cuatro más) mientras Spotify no cambie eso.

- **Alta hecha de Spotify y GitHub** (noche del 19 de septiembre): Hector creó las dos aplicaciones —Spotify en modo
  desarrollo y la OAuth app «SkyOS» de GitHub, con sus URLs de retorno— y sus ids públicos están en Vercel
  (`VITE_SPOTIFY_CLIENT_ID`, `VITE_GITHUB_CLIENT_ID`); los secretos, en `SPOTIFY_CLIENT_SECRET` y `GITHUB_CLIENT_SECRET`
  como variables **sensibles** (`vercel env add … --sensitive`): ni el panel ni `vercel env pull` los devuelven.
  Comprobado en vivo contra `/api/oauth/proxy`: un canje con el id del despliegue y un código inventado recibe de Spotify
  `invalid_grant` («Invalid authorization code»: credenciales aceptadas, código inválido), y con un id ajeno recibe
  `invalid_client` (no se añadió ningún secreto). Al revisar el paquete publicado, ojo: los valores de `import.meta.env`
  van en el chunk `fs-*.js`, no en `index-*.js`; el commit 99657f0 («el redeploy compiló sin las variables») nació de
  mirar solo `index-*.js`. Siguen sin alta Slack y Box; `VITE_GOOGLE_CLIENT_ID`, `VITE_MS_CLIENT_ID` y `VITE_BRIDGE_URL`
  existen en producción pero vacías.

- **Por qué Spotify «siempre pide volver a conectar»** (madrugada del 20 de septiembre; sondeado sin cuentas
  personales). Un token de la propia aplicación (`client_credentials`), que la Web API acepta con 200, recibe del
  gateway `mcp-gateway-external-pilot.spotify.net/mcp` un **403 «RBAC: access denied»** en texto plano y sin
  WWW-Authenticate; un token inventado recibe 401 `invalid_token`. Es decir: el gateway valida el token y después
  rechaza a la aplicación —el piloto solo sirve a los clientes que Spotify admitió—. No es el canje (comprobado en
  vivo) ni la cuenta. Lo nuestro era el mensaje: `keepAlive` y la vuelta del consentimiento trataban 401 y 403 igual
  («vuelve a conectarla») y la persona daba vueltas. Ahora `McpError.detail` lleva el cuerpo del rechazo
  (`serverWords`, en `mcp/refusal.ts`), `describeRefusal` distingue sesión caducada, scopes insuficientes y
  aplicación no admitida, con las palabras del servidor, y la tarjeta de Spotify lo avisa antes del clic (`notice` en
  el catálogo; quítalo el día que Spotify admita la app). `parseChallenge` vive en `mcp/challenge.ts`, sin nada del
  navegador, para poder probar esas notas solas. De paso, el relevo solo añade el secreto a `authorization_code` y
  `refresh_token`: un `client_credentials` con nuestro id público ya no sale firmado (con Box habría dado un token de
  empresa a cualquiera que supiera el id).

## Tanda del 20 de septiembre de 2026: Spotify por la Web API, con un servidor MCP propio

Hector volvió con «Spotify no me funciona» y preguntó si, ya que el MCP de Spotify no sirve, se podía ir por la API
directa. Se pudo, sin romper la regla de la casa (todo por MCP): el escritorio sigue hablando MCP; lo que cambió es
quién está del otro lado.

- **`api/mcp/spotify`** (edge, `api/_lib/spotify-mcp.ts`): un servidor MCP sin estado que traduce a la Web API. Reta
  con 401 y `resource_metadata` como cualquier servidor remoto; los metadatos del recurso viven en
  `/.well-known/oauth-protected-resource/api/mcp/spotify` (reescritura en `vercel.json` a `?prm=1`) y apuntan a
  `accounts.spotify.com` con los scopes que usan las herramientas. Atiende las dos eras del transporte de Sky: la
  moderna (sin handshake, `serverInfo` en `_meta`) y la de `initialize` (2025-03-26 … 2025-11-25). El Bearer de la
  persona va a `api.spotify.com` y a ningún otro sitio. Un 401 de Spotify vuelve como reto `invalid_token`, para que
  el cliente renueve; un 403 o 404 se vuelve un error de herramienta legible (Premium, sin dispositivo, persona no
  dada de alta), nunca un HTTP 403 que la tarjeta leería como «aplicación no admitida».
- **Herramientas** (18): search (máximo diez, límite del modo desarrollo), profile, now_playing, play, pause,
  next_track, previous_track, queue_add, devices, my_playlists, playlist_items, create_playlist, add_to_playlist,
  saved_tracks, save_tracks, remove_saved_tracks, top_items, recently_played. Las respuestas van resumidas (nombre,
  artistas, álbum, duración, uri, enlace), no el JSON entero de Spotify. Ids y URIs se validan antes de salir, y se
  aceptan enlaces de open.spotify.com. Sin recomendaciones ni novedades: Spotify las quitó del modo desarrollo.
- **Catálogo**: la entrada de Spotify apunta a `ownServer('/api/mcp/spotify')` (mismo origen que la página: sin CORS
  ni relevo), con `featuredTools` y un `notice` que explica el piloto cerrado y los límites (cinco personas, Premium).
  `reload()` en `manager.ts` mueve los registros guardados cuya entrada del catálogo cambió de dirección: la URL
  nueva, los tokens intactos (mismo servidor de autorización, misma cuenta) y las herramientas se releen. Así la
  conexión que Hector ya tenía empieza a funcionar sin volver a pedir permiso.
- **Pruebas**: `api/_lib/spotify-mcp.test.ts` con un `fetch` falso: metadatos, reto sin token, `invalid_token`,
  initialize, notificación 202, tools/list, search, 204 de now_playing, 403 legible, validación de URIs y enlaces,
  create_playlist en dos pasos. 20 archivos, 166 pruebas.
- **Pendiente**: el puente local (`bridge/`) no monta este servidor; en desarrollo la tarjeta de Spotify apunta a
  `http://localhost:5173/api/mcp/spotify`, que Vite no sirve. Para probarlo en local, `vercel dev` o montar el mismo
  módulo en el puente. La comprobación de punta a punta con una cuenta real la hace Hector (dueño de la app, ya dado
  de alta); desde aquí se comprobó con un token de aplicación (`client_credentials`) contra producción.

## Tanda del 20 de septiembre de 2026 (segunda): lo que salió mal al preparar la imagen de lanzamiento

Preparando una captura del escritorio le pedí a Sky dos cosas normales y las dos salieron mal. Los cuatro fallos y
su arreglo, todos comprobados en vivo con un perfil local de prueba y la llave de Groq de desarrollo:

- **«¿Qué tiempo hará mañana?» → «no dispongo de datos meteorológicos»**, con el clima puesto en el escritorio.
  No existía ninguna herramienta de clima: el widget consulta Open-Meteo por su cuenta y Sky no tenía por dónde.
  Nuevo `kernel/commands/weather.ts` (`weather.forecast`), con el mismo Open-Meteo y la misma caché que el widget,
  para el lugar del perfil, el que digan o el de la red. Cada día llega con su nombre resuelto —«hoy», «mañana»,
  «el jueves»— porque el modelo no sabe qué día es hoy; `dayLabel` tiene pruebas, incluido el cruce de mes y año.
  Ahora contesta «mañana habrá tormenta con temperaturas entre 22 °C y 30 °C», que es lo que dice el widget.
- **«Crea un widget con la cuenta regresiva para el fin de año» → un pomodoro de 25 minutos**, y Sky diciendo que
  contaba hasta el fin de año. El propio catálogo llamaba al temporizador «cuenta regresiva con avisos», así que el
  modelo hacía lo que le decíamos. `WIDGET_META.timer` ahora dice lo que hace («una duración que corre hacia
  abajo»), y la ayuda de tipos manda escribir `html` cuando ningún tipo propio hace exactamente lo que piden.
- **El widget html llegaba en blanco.** El modelo dejó un `<style>` sin cerrar y el navegador se tragó el documento
  entero como CSS; el escritorio se quedó con una caja blanca y Sky dijo «listo». `htmlProblem()` en
  `commands/widgets.ts` rechaza el `<style>` o el `<script>` sin cerrar y el documento que no pinta nada, tanto al
  crear como al actualizar; el modelo recibe el porqué y lo vuelve a escribir bien. Con pruebas del caso real.
- **La cuenta regresiva salía sin números.** El documento era correcto, pero con el `<script>` antes del
  `<p id="count">`: `getElementById` daba null, `update()` tiraba y el `setInterval` de la línea siguiente ya no se
  registraba. `lib/sandboxHtml.ts` (`scriptsLast`) lleva los scripts al final del `<body>` antes de pintar —mover
  la etiqueta conserva el ámbito global, envolverlos en DOMContentLoaded rompería un `onclick` del HTML—. Arregla
  también los widgets ya guardados, sin tocar lo que el modelo escribió: el que estaba mudo empezó a contar.
- De paso, el marco del sandbox trae tamaños de tarjeta (títulos a 1.25em, `overflow:auto`) y la ayuda dice el
  tamaño real del marco (380×300 menos la cabecera) y que no repita el título, que la cabecera ya lo enseña.

Cómo se probó, por si hace falta repetirlo: `.env.shot.local` (ignorado por git) con las variables de Supabase en
blanco → `npx vite --mode shot --port 4183` arranca SkyOS con cuentas apagadas, así que entra por la bienvenida y
crea un perfil local, sin tocar producción ni cuentas de nadie. Chrome sin ventana con `--remote-debugging-port` y
un cliente del protocolo de DevTools escrito a mano (Node 22 ya trae WebSocket) hace la bienvenida, pulsa, escribe
y captura a 2× de resolución. Los scripts viven en el scratchpad de la sesión.

- **La llave de Groq, comprobada de punta a punta** (20 de septiembre, tras preguntarlo Hector). Dónde se ve y
  dónde no: el paquete publicado no lleva ninguna cadena `gsk_…` (los cuatro chunks revisados en vivo), el
  historial del repositorio tampoco —`git log -S 'gsk_'` marca seis commits y ninguno contiene una llave real,
  solo el `startsWith('gsk_')` del código y los `gsk_…` de los marcadores de posición—, y los campos de llave de
  la interfaz son todos `type="password"` y solo contienen la llave de cada persona: la incluida se resuelve al
  hacer la petición (`resolveKey`) y nunca entra ni al estado ni a localStorage. Lo que sí era legible: la
  variable `GROQ_API_KEY` en Vercel no estaba marcada como sensible, así que el panel y `vercel env pull` la
  devolvían en claro. Ya está guardada con `--sensitive`, como los secretos de las apps, y al descargarla vuelve
  vacía. Queda legible, por fuerza, la de `.env.local` en la máquina de desarrollo: `npm run dev` no tiene
  servidor donde esconderla.
