import { useMemo } from 'react'
import { useSettings } from '../state/settings'
import { scriptsLast } from '../lib/sandboxHtml'
import { cn } from '../lib/utils'

const THEME_VARS = ['--ink', '--ink-2', '--ink-3', '--accent', '--accent-soft', '--surface', '--surface-2', '--surface-solid', '--line', '--line-2', '--danger']

/** Reads the live palette so model-written HTML can match the current theme without touching the parent page. */
function themeCss(): string {
  const cs = getComputedStyle(document.documentElement)
  const vars = THEME_VARS.map((v) => `${v}: ${cs.getPropertyValue(v).trim()};`).join(' ')
  return `:root { ${vars} color-scheme: ${document.documentElement.classList.contains('dark') ? 'dark' : 'light'}; }
html, body { margin: 0; height: 100%; }
body { font-family: "Nunito Variable", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: var(--ink); background: transparent; font-size: 13px; overflow: auto; }
* { box-sizing: border-box; }
h1, h2, h3 { font-size: 1.25em; line-height: 1.2; margin: 0 0 0.35em; font-weight: 600; }
p, ul, ol { margin: 0 0 0.5em; }`
}

/**
 * The promise these widgets make is that they are self-contained: their CSS and their scripts travel inside the
 * document and they ask the network for nothing. This says so to the browser as well, so a block written from a
 * poisoned document cannot quietly send what it can see to someone else. Images and fonts as data: URIs still
 * work, which is what a self-contained widget uses.
 */
const CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  "img-src data: blob:",
  "font-src data:",
  "media-src data: blob:",
  "form-action 'none'",
  "base-uri 'none'",
].join('; ')

/**
 * AI-authored HTML inside a sandboxed iframe: scripts may run, but the document has no access to Sky's
 * origin, storage or cookies, cannot navigate the parent page and cannot reach the network. Shared by desktop
 * widgets and canvas blocks.
 */
export function HtmlSandbox({ html, title, className }: { html: string; title: string; className?: string }) {
  const dark = useSettings((s) => s.dark)

  const srcDoc = useMemo(() => {
    const base = `<meta http-equiv="Content-Security-Policy" content="${CSP}"><style>${themeCss()}</style>`
    // Los scripts, después del contenido: escritos arriba buscaban elementos que aún no existían y el widget
    // se quedaba mudo. Ver lib/sandboxHtml.ts.
    const ready = scriptsLast(html)
    if (/<html[\s>]/i.test(ready)) {
      return /<head[\s>]/i.test(ready) ? ready.replace(/<head([^>]*)>/i, `<head$1>${base}`) : ready.replace(/<html([^>]*)>/i, `<html$1><head>${base}</head>`)
    }
    return `<!doctype html><html><head><meta charset="utf-8">${base}</head><body>${ready}</body></html>`
    // The palette is read through the DOM, so re-run when the colour on screen changes — including when the
    // system flips to dark while the setting stays on «Sistema».
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [html, dark])

  if (!html.trim()) return <p className="p-3 text-[12px] text-ink-3">Sin contenido.</p>

  return <iframe title={title} sandbox="allow-scripts" srcDoc={srcDoc} className={cn('h-full w-full border-0 bg-transparent', className)} />
}
