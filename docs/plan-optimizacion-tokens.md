# Plan de remediación: tokens y latencia del agente

## Objetivo

Eliminar el piso de contexto desproporcionado de las consultas sencillas sin degradar la capacidad del agente ni sacrificar innecesariamente la caché de prompts.

Caso de control principal:

> `¿Qué hora es?`

Resultado objetivo: respuesta local correcta, sin llamada al proveedor, sin tokens y con latencia menor a 100 ms en condiciones normales del navegador.

## Línea base comprobada

La superficie actual de una conversación normal contiene 58 herramientas internas y serializa 22.129 bytes antes de añadir herramientas MCP. El prompt base contiene 3.185 caracteres. Groq admite además hasta 7.000 bytes de herramientas MCP por solicitud; otros proveedores reciben hasta cinco veces ese presupuesto. El historial conserva hasta 24 mensajes y el estado del escritorio añade archivos, ventanas, widgets, selección y apps.

La lista completa de herramientas es estable de forma deliberada para favorecer la caché. Sin embargo, esto contradice el contrato documentado de `CommandDef.keywords`, que afirma que las herramientas con palabras clave solo viajan cuando son relevantes.

La solución no será activar el filtro actual sin más: para `hora`, las palabras compartidas de `WINDOW_WORDS` seleccionarían unas 30 herramientas y 8.240 bytes. Hace falta separar dominios e intenciones.

## Principios de diseño

1. **No usar un modelo para datos deterministas locales.** Hora, fecha, tema y otros datos simples se resuelven en el cliente cuando la intención sea inequívoca.
2. **Presupuesto explícito, no crecimiento accidental.** Herramientas, estado, historial y resultados tendrán límites independientes y observables.
3. **Conjuntos estables por dominio.** El enrutador seleccionará paquetes pequeños y ordenados; no combinaciones arbitrarias distintas en cada frase. Esto conserva prefijos reutilizables dentro de cada dominio.
4. **Carga diferida para el catálogo largo.** Una herramienta mínima de descubrimiento permitirá ampliar el conjunto en una segunda ronda solamente cuando el enrutador no pueda resolver la intención con confianza.
5. **MCP por app explícita o continuidad demostrable.** Nunca se enviarán herramientas de apps no relacionadas solo porque estén conectadas.
6. **Fallback seguro.** Un fallo de clasificación debe poder ampliar herramientas; nunca debe ejecutar una herramienta incorrecta ni inventar que una capacidad no existe.
7. **Optimizar costo real y latencia, no solo el contador visible.** Se distinguirán tokens totales, tokens en caché, tokens no almacenados, llamadas e iteraciones.

## Fundamento en documentación oficial

- OpenAI documenta que las definiciones de herramientas forman parte del prefijo almacenado en caché y que sus nombres, esquemas, descripciones y orden afectan la reutilización. También recomienda carga diferida mediante `tool_search` para evitar cargar todas las definiciones desde el inicio. Aunque Sky usa Chat Completions con varios proveedores y no puede depender de esa función, implementará el mismo patrón local: catálogo mínimo más expansión bajo demanda. [Prompt caching](https://developers.openai.com/es-419/api/docs/guides/prompt-caching) · [Tool search](https://developers.openai.com/es-419/api/docs/guides/tools-tool-search)
- Groq recomienda explícitamente 3–5 herramientas por solicitud, 10–15 como máximo para modelos capaces, y un router para bibliotecas grandes. [Local tool calling](https://console.groq.com/docs/tool-use/local-tool-calling)
- Groq exige coincidencia exacta de prefijo para aprovechar la caché y recomienda colocar contenido estático primero y datos variables al final. La caché no está garantizada y debe medirse mediante `cached_tokens`. [Prompt caching](https://console.groq.com/docs/prompt-caching)

## Arquitectura objetivo

### 1. Resolutores locales

Crear un módulo puro `localIntents.ts` que reconozca únicamente formulaciones inequívocas y devuelva una respuesta estructurada:

- hora local;
- fecha/día local;
- combinación fecha y hora;
- tema actual;
- conteo de ventanas abiertas, si la petición no solicita análisis ni cambios.

Reglas:

- normalización de mayúsculas, acentos, signos y espacios;
- expresiones ancladas, no coincidencias parciales amplias;
- rechazo si hay adjuntos, instrucciones adicionales o referencias contextuales;
- formateo con la configuración regional y zona efectivas del navegador/perfil;
- si no hay confianza total, continuar por el agente normal.

La sesión guardará la respuesta como un turno normal, con `model: "local"`, uso cero y latencia medida. Así no se rompe la persistencia ni la experiencia de conversación.

### 2. Paquetes de herramientas internas

Reemplazar el significado ambiguo de `keywords` con metadatos explícitos:

```ts
type ToolDomain =
  | 'files'
  | 'windows'
  | 'widgets'
  | 'canvas'
  | 'projects'
  | 'flows'
  | 'apps'
  | 'storage'
  | 'jobs'
  | 'profile'
```

Cada comando AI-visible declarará uno o más dominios. El enrutador producirá paquetes con orden estable. Meta inicial:

- 0 herramientas para conversación y consultas locales;
- 3–5 en el caso común;
- máximo blando de 10;
- máximo duro de 15, salvo una opción explícita de trabajo especializado con prueba que lo justifique.

Los comandos generales que hoy carecen de `keywords` dejarán de viajar siempre. Se asignarán a un dominio y se activarán por intención, contexto activo o continuidad de una llamada previa.

### 3. Descubrimiento diferido

Mantener siempre disponible, solo cuando la petición parezca pedir una acción pero el dominio tenga baja confianza, una herramienta sintética `system.searchTools`.

Flujo:

1. La primera llamada recibe el núcleo mínimo y `system.searchTools`.
2. El modelo solicita capacidades usando una consulta breve.
3. El cliente busca en el registro por título, descripción, dominio y palabras clave.
4. Antes de la siguiente iteración, el agente añade únicamente las definiciones encontradas, en orden estable.
5. La expansión queda registrada en telemetría y limitada por presupuesto.

Esto reproduce la carga diferida recomendada oficialmente sin depender de una API exclusiva de un proveedor.

### 4. MCP relevante y diferido

Cambiar `mcpToolSpecs(context)` para que `prompt` y `recent` sí influyan:

- mención explícita del nombre de la app;
- vocabulario propio de la app (`correo`, `calendario`, `repositorio`, etc.);
- continuidad con una herramienta MCP usada en los últimos turnos;
- app activa en el escritorio.

Solo una app por defecto. Varias únicamente cuando la petición las nombre o pida compararlas. Se conservarán orden y schemas estables dentro de cada app. El límite de bytes seguirá siendo una última defensa, no el selector principal.

Si no se identifica una app con confianza, no viajan herramientas MCP. La búsqueda diferida puede descubrirlas cuando la petición sea claramente externa pero ambigua.

### 5. Estado por intención

Dividir `buildStateSnapshot()` en secciones con presupuesto:

- `base`: fecha/hora, tema y contexto activo mínimo;
- `files`: listado y selección;
- `windows`: ventanas;
- `widgets`;
- `project`;
- `apps`.

El enrutador solicita solo las secciones necesarias. El contenido variable permanece al final del turno. Se añadirá un límite total de caracteres y una marca explícita de truncamiento. Para solicitudes que necesiten más detalle, el modelo usará herramientas de lectura.

### 6. Historial con presupuesto de tokens/caracteres

Mantener la gramática de llamadas y resultados, pero sustituir el límite puramente basado en 24 mensajes por un presupuesto:

- conservar íntegro el intercambio actual;
- conservar los últimos turnos relevantes;
- recortar resultados antiguos como ya se hace;
- resumir cuando se supere el presupuesto, no solo al llegar a 18 mensajes;
- nunca adjuntar historial a una respuesta local;
- conservar continuidad MCP y dominios usados como metadatos pequeños, no reconstruirla buscando texto accidental.

### 7. Observabilidad correcta

Extender el resultado de cada ejecución con:

- `requestCount` e `iterationCount`;
- tokens de entrada, salida y caché por llamada;
- bytes de sistema, estado, historial, herramientas internas y MCP;
- cantidad y nombres de dominios/apps enviados;
- tiempo de preparación;
- tiempo hasta primer token;
- tiempo de herramientas;
- duración total;
- motivo de expansión diferida.

La UI mostrará por separado:

- tokens lógicos totales;
- tokens leídos desde caché;
- tokens no almacenados estimados;
- número de llamadas.

No se afirmará “costo” cuando el proveedor solo entregue conteos de tokens sin información suficiente de facturación.

### 8. Límites de iteración y prevención de repeticiones

- Conservar el límite global de iteraciones, pero añadir un límite específico de una expansión de catálogo por dominio/app.
- Detectar la misma llamada con los mismos argumentos repetida dentro de una ejecución y devolver un error local sin volver a ejecutarla.
- No permitir `system.info` si la respuesta solicitada ya está disponible en el estado y no se pidió una comprobación completa del sistema.
- Registrar cuándo una herramienta provoca una segunda llamada para poder distinguir costo normal de comportamiento redundante.

## Entregas

### Entrega A: medición y red de seguridad

- Instrumentación por componente e iteración.
- Pruebas de presupuesto con la superficie actual como línea base.
- Matriz de consultas representativas.

### Entrega B: consultas locales

- Resolutor hora/fecha/tema/ventanas.
- Integración con sesión y persistencia.
- Pruebas de falsos positivos y zona horaria.

### Entrega C: router y paquetes internos

- Metadatos de dominio.
- Selección estable y límites 3–5/10–15.
- Descubrimiento diferido y fallback.

### Entrega D: MCP y estado selectivo

- Selección por app y continuidad.
- Secciones de estado por intención y presupuesto.

### Entrega E: historial y UI de uso

- Presupuesto de historial.
- Métricas coherentes entre proveedores.
- Panel de diagnóstico de desarrollo.

## Pruebas obligatorias

### Unitarias

- Normalización y reconocimiento de intenciones locales.
- Frases similares que no deben interceptarse: `crea un reloj`, `qué hora es en Tokio`, `dime la hora y abre el calendario`, `analiza por qué la hora está mal`.
- Selección de dominios y orden determinista.
- Límite duro de herramientas.
- Selección MCP por app y continuidad.
- Presupuesto y truncamiento del estado.
- Preservación de pares llamada/resultado en historial.
- prevención de llamadas repetidas.

### Integración

- Una conversación sencilla no recibe herramientas.
- Una acción de archivos recibe solo el paquete de archivos.
- Una petición ambigua descubre y amplía herramientas una sola vez.
- Una petición Gmail no recibe herramientas de otras apps.
- Una llamada de herramienta realiza la segunda petición con el resultado correcto.
- La caché conserva prefijos estables entre consultas del mismo paquete.

### Regresión funcional

Ejecutar una matriz mínima de 30 frases que cubra archivos, ventanas, widgets, proyectos, lienzos, flujos, almacenamiento, apps y conversación. Comparar herramientas disponibles, herramienta elegida, resultado y número de llamadas.

## Criterios de aceptación

| Caso | Llamadas al modelo | Herramientas iniciales | Entrada objetivo | Latencia objetivo |
|---|---:|---:|---:|---:|
| `¿Qué hora es?` | 0 | 0 | 0 tokens | <100 ms |
| saludo/conversación breve | 1 | 0 | <1.500 tokens | p95 <3 s en Groq rápido |
| acción simple de un dominio | 1–2 | 3–5, máximo 10 | <2.500 tokens iniciales | p95 <5 s |
| acción MCP de una app | 1–2 | solo esa app, máximo 15 total | <4.000 tokens iniciales | medido por proveedor |
| intención ambigua con descubrimiento | 2 máximo antes de ejecutar | núcleo + búsqueda, luego expansión | <4.500 tokens acumulados | sin bucles |

Adicionalmente:

- ninguna petición normal comienza con las 58 herramientas actuales;
- ningún conjunto supera 15 herramientas sin una excepción explícita probada;
- `prompt + recent` afecta realmente la selección MCP;
- las pruebas fallan si aumenta el presupuesto acordado;
- la interfaz distingue caché de entrada nueva;
- `npm test`, `npm run lint` y `npm run build` terminan correctamente.

## Despliegue y reversión

Introducir un modo de compatibilidad controlado por configuración durante el desarrollo:

- `legacy`: catálogo completo actual;
- `routed`: paquetes y carga diferida.

El modo `routed` será el predeterminado cuando pase la matriz funcional. La telemetría comparará ambos modos durante pruebas locales. Si un dominio presenta regresiones, se puede volver temporalmente a `legacy` sin retirar los resolutores locales ni la instrumentación.

## Orden de implementación recomendado

1. Instrumentación y pruebas de presupuesto.
2. Resolutor local de hora/fecha.
3. Dominios explícitos y router de herramientas internas.
4. Descubrimiento diferido.
5. Filtrado MCP.
6. Estado selectivo.
7. Historial por presupuesto y UI de uso.
8. Matriz completa, ajuste de umbrales y retirada del modo legado.

Este orden produce una mejora inmediata y verificable, pero mantiene una ruta segura para completar la arquitectura sin un cambio monolítico difícil de depurar.
