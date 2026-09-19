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
| Alta | 53 | 53 (arregladas; 7 esperan verificación en el navegador) | 0 |
| Media | 105 | 105 | 0 |
| Baja | 28 | 28 (arregladas; las 26 de la última tanda esperan verificación en el navegador) | 0 |

Las 53 altas tienen su arreglo comprometido en git. Las últimas siete (18, 23, 26, 32, 45, 46, 50) se
arreglaron en la tanda de septiembre y esperan su verificación en el navegador, con la receta de cada caso en
[`CONTINUAR.md`](CONTINUAR.md). Las 28 bajas están arregladas también; las 26 cerradas en la última tanda
esperan su verificación igualmente, con la receta por commit en [`CONTINUAR.md`](CONTINUAR.md).

## Cómo se trabajan

Por archivo, no por severidad: se leen todos los hallazgos de un archivo, se arreglan juntos, se verifica con
`npx tsc -b` (no `--noEmit`: la raíz es un tsconfig de solución y no comprueba nada), `npx oxlint src`,
`npm test` y `npm run build`, y se prueba en el navegador con un perfil sintético antes de commitear por tema.

Cada arreglo lleva en el código un comentario que dice **qué pasaba**, no qué hace la línea.
