# Seguridad de SkyOS

Este documento dice qué protege SkyOS, cómo, y qué **no** protege. Está escrito para que nadie confíe de más:
una promesa vaga de seguridad es peor que ninguna.

## Qué guarda y dónde

| Dato | Dónde vive | Quién lo ve |
|---|---|---|
| Archivos y carpetas | IndexedDB (`mesa-<id>`) y OPFS (`users/<id>`) del navegador | Solo este dispositivo |
| Conversación con Sky, resúmenes e índice semántico | La misma base por usuario | Solo este dispositivo |
| Texto extraído de PDF y Office | La misma base por usuario | Solo este dispositivo |
| Ventanas, historial de acciones y proyectos | La misma base por usuario | Solo este dispositivo |
| Preferencias, tema, tono, ubicación | `localStorage`, con el id del usuario en la clave | Solo este dispositivo |
| Llave de IA propia | `localStorage` del usuario | Este dispositivo y, al usarla, el proveedor que elijas |
| Tokens de apps conectadas (MCP) y de OneDrive | Base del usuario / `localStorage` con su sufijo | Este dispositivo y el servicio correspondiente |
| Registro de personas del navegador (nombre, iniciales, hash del PIN) | IndexedDB `mesa-system` | Solo este dispositivo |

Nada de esto viaja a servidores de SkyOS. No hay cuentas en la nube, no hay backend con tus datos.

## Qué sale del dispositivo y cuándo

- **Al hablar con Sky**: el mensaje, el `<estado>` del escritorio (nombres de archivos, carpeta activa, memoria
  del proyecto) y los archivos que adjuntes van al proveedor del modelo. Con la llave incluida el proveedor es
  Groq y la petición pasa por `/api/ai/*`, que solo agrega la llave del servidor; con tu propia llave el
  navegador habla directo con tu proveedor y esa ruta no se usa.
- **Al usar una app conectada**: la petición va al servidor MCP de esa app, con tu token. Cuando ese servidor no
  acepta llamadas desde el navegador, pasa por `/api/mcp` o `/api/oauth`, que la repiten sin guardar nada.
- **Al sincronizar**: los archivos suben a tu Google Drive, Dropbox u OneDrive, con tu cuenta.
- **El clima y la ubicación aproximada** consultan Open-Meteo e ipwho.is / ipapi.co.

Lo que **nunca** sale: tus llaves y tokens no se ponen en prompts, ni en el contexto del modelo, ni en capturas.
No hay telemetría.

## Lo que protege, y cómo

**Entre personas del mismo navegador.** Cada perfil tiene su base de datos, su carpeta OPFS y sus claves de
`localStorage`. La sesión se fija cuando la pestaña carga: todo lo que esa pestaña lee o escribe se deriva de
ese valor y de ningún otro, así que otra pestaña no puede desviarla. Si otra pestaña entra con otra cuenta o
cierra sesión, esta se detiene, desmonta el escritorio —lo que apaga sus suscripciones, guardados y trabajos— y
pide recargar. Verificado: un id de archivo de otra persona no se lee ni a mano ni por comando, y la búsqueda
no lo encuentra.

**Ante lo que Sky decide hacer.** Cada comando declara qué le hace al mundo (`kernel/consent.ts`). Antes de
correr, una acción pedida por el modelo pasa por una puerta: lo que no se puede deshacer, lo que sale a una app
conectada y lo que toca más de diez cosas a la vez requieren un sí de la persona. Con la preferencia «pregúntame
antes», cualquier cambio lo requiere. Esa regla vive en el código, no en el prompt: un documento con
instrucciones escondidas, o un modelo equivocado, no la saltan. Lo que la persona hace con sus manos nunca se
interrumpe.

**Ante contenido ajeno.** El HTML que escribe el modelo corre en un marco de origen opaco, sin acceso al
almacenamiento de SkyOS, y con una política que le prohíbe pedir nada a la red: no puede filtrar lo que ve. El
navegador integrado no puede navegar la ventana principal. El contenido de documentos y páginas se le declara al
modelo como datos, no como instrucciones.

**En los relés del servidor.** `/api/mcp` y `/api/oauth` solo aceptan destinos `https` públicos: rechazan
`localhost`, las redes privadas y el rango de metadatos de la nube, revisan de nuevo cada redirección y sueltan
el `Authorization` al cambiar de origen. Las tres rutas solo atienden peticiones del propio sitio. La ruta del
modelo incluido además tiene un presupuesto por dirección IP.

## Lo que **no** protege

Esto importa tanto como lo anterior.

- **El PIN no es cifrado.** Es un hash PBKDF2 que evita que alguien entre de paso a tu perfil desde la pantalla
  de inicio. No protege los datos: quien tenga acceso al navegador y a sus herramientas de desarrollo puede
  abrir la base de cualquier perfil. Los perfiles son comodidad, no una frontera de seguridad.
- **Los datos no están cifrados en reposo.** Viven como cualquier dato de sitio web. Cifrarlos en serio exige
  una llave que el usuario aporte en cada arranque, y hoy SkyOS no la pide.
- **La cuenta verifica quién eres, no qué puedes ver.** Con Supabase configurado, entrar exige un código
  enviado a tu correo y la sesión la valida un servidor, así que «mi sesión» ya significa algo fuera de este
  navegador. Pero los archivos siguen siendo locales y no hay nada remoto que autorizar: el escritorio se abre
  porque la cuenta coincide con la que lo creó, no porque un servidor conceda permisos sobre datos. Quien tenga
  acceso al navegador y a sus herramientas puede seguir abriendo la base de cualquier perfil de ese equipo. El
  día que algo se guarde fuera del dispositivo, esa pieza tendrá que verificar identidad y pertenencia en cada
  operación.
- **La llave incluida es gastable.** El sitio es público y la llave vive en el servidor. La puerta de mismo
  origen aparta a quien pasa por ahí, y el presupuesto por IP pone un techo, pero esas cabeceras se pueden
  falsificar y el contador vive en la memoria de cada instancia del borde. Es un freno, no una cerradura: quien
  quiera su propio techo pone su llave en Ajustes.
- **Un nombre de dominio público puede resolver a una dirección privada** (DNS rebinding). El relé revisa el
  nombre, no la dirección a la que resuelve; el entorno de borde no permite resolverla antes de conectar.
- **Sky lee lo que le das.** Si adjuntas un documento con instrucciones escondidas, el modelo lo verá. La puerta
  de consentimiento evita que eso se convierta en acciones sin tu permiso, pero el contenido sí entra al
  contexto y puede influir en lo que Sky responde.
- **`VITE_GOOGLE_CLIENT_SECRET`, si se usa, es público.** Cualquier variable con prefijo `VITE_` se hornea en el
  JavaScript que descarga el visitante. `npm run build` deja fuera `VITE_GROQ_KEY` aunque esté en el entorno —el
  paquete sale sin llave y usa `/api/ai`— y avisa cuando encuentra el secreto de Google, que sí se incluye porque
  el flujo lo necesita. La forma correcta de conectar Google es un cliente OAuth de tipo «Aplicación de página
  única», que usa PKCE y no lleva secreto.
- **Una extensión del navegador con permisos sobre el sitio lo ve todo.** No hay defensa posible desde aquí.

## Reportar un problema

Abre un issue en <https://github.com/hdiaz16/SkyOS/issues>. Si el problema permite leer datos de otra persona o
gastar la llave incluida, dilo en el título para atenderlo primero.
