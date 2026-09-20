/**
 * Arreglos deterministas al HTML que escribe el modelo para un widget o un bloque del lienzo. No es cosmética:
 * el documento se pinta en un marco aislado y, si el script falla, lo único que queda es una tarjeta muda.
 */

/** Un <script> del propio documento (sin src; la CSP no deja traer ninguno de fuera). */
const INLINE_SCRIPT = /<script\b(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script\s*>/gi

/**
 * Lleva los <script> al final del <body>. El modelo los escribe arriba y luego buscan elementos que todavía no
 * existen: la primera cuenta regresiva que pidió Hector salía con el título y el hueco vacío, porque
 * `document.getElementById('count')` daba null, la llamada tiraba y el setInterval de la línea siguiente ya no
 * llegaba a registrarse. Al final del body encuentran el documento entero, y siguen siendo globales —moverlos
 * conserva el ámbito, envolverlos en DOMContentLoaded lo rompería para un onclick del HTML—.
 */
export function scriptsLast(html: string): string {
  const scripts: string[] = []
  const withoutScripts = html.replace(INLINE_SCRIPT, (whole) => {
    scripts.push(whole)
    return ''
  })
  if (!scripts.length) return html
  const tail = scripts.join('')
  const closing = withoutScripts.search(/<\/body\s*>/i)
  if (closing === -1) return withoutScripts + tail
  return withoutScripts.slice(0, closing) + tail + withoutScripts.slice(closing)
}
