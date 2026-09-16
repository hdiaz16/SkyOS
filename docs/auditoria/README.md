# Auditoría de pulido

Revisión archivo por archivo de SkyOS hecha en septiembre de 2026, antes de abrir la puerta a más gente.
Cada hallazgo describe un caso concreto que alguien puede vivir usando el escritorio, no un olor de código.

Si llegas nuevo a este trabajo, empieza por [`CONTINUAR.md`](CONTINUAR.md): el relevo completo con el
método, lo que falta y las reglas de producto.

## Los archivos

- **`hallazgos.json`** — la auditoría completa: 53 de severidad alta, 105 media y 28 baja, con el archivo, la
  línea, el problema (con su caso concreto) y el arreglo propuesto.
- **`pendientes-media.md`** — lo que queda de severidad media, agrupado por archivo. Hoy está vacío; se
  regenera desde el JSON.

## Dónde vamos

| Severidad | Total | Resueltas | Pendientes |
| --- | --- | --- | --- |
| Alta | 53 | 42 | 11 |
| Media | 105 | 105 | 0 |
| Baja | 28 | 0 | 28 |

Las 11 altas que quedan: la hoja de cálculo pierde formatos y fechas al guardar (6), la matriz densa que sale
de `!ref` (8), el PDF que monta todas las páginas de golpe (11), las ediciones del lienzo que no pasan por el
bus de comandos (17), la barra de direcciones que se desincroniza al navegar dentro (18), el contador de
archivos indexados en cero (23), el `resumeRedirect` de MCP que no es interactivo (26), el panel que promete
arrastrar y soltar y no existe (32), la configuración de widget que no se valida por tipo (45), `parseCanvas`
convirtiendo lo ilegible en vacío (46) y `transformFile` recortando en silencio (50).

## Cómo se trabajan

Por archivo, no por severidad: se leen todos los hallazgos de un archivo, se arreglan juntos, se verifica con
`npx tsc -b` (no `--noEmit`: la raíz es un tsconfig de solución y no comprueba nada), `npx oxlint src`,
`npm test` y `npm run build`, y se prueba en el navegador con un perfil sintético antes de commitear por tema.

Cada arreglo lleva en el código un comentario que dice **qué pasaba**, no qué hace la línea.
