import { useMemo } from 'react'
import type { Widget } from '../../kernel/widgets'
import { useSettings } from '../../state/settings'

const THEME_VARS = ['--ink', '--ink-2', '--ink-3', '--accent', '--accent-soft', '--surface', '--surface-2', '--surface-solid', '--line', '--line-2', '--danger']

/** Reads the live palette so model-written HTML can match the current theme without touching the parent page. */
function themeCss(): string {
  const cs = getComputedStyle(document.documentElement)
  const vars = THEME_VARS.map((v) => `${v}: ${cs.getPropertyValue(v).trim()};`).join(' ')
  return `:root { ${vars} color-scheme: ${document.documentElement.classList.contains('dark') ? 'dark' : 'light'}; }
html, body { margin: 0; height: 100%; }
body { font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: var(--ink); background: transparent; font-size: 13px; }
* { box-sizing: border-box; }`
}

/**
 * Renders AI-authored HTML inside a sandboxed iframe: scripts may run, but the document has no access
 * to Sky's origin, storage or cookies, and cannot navigate the parent page.
 */
export function HtmlWidget({ widget }: { widget: Widget }) {
  const theme = useSettings((s) => s.theme)
  const html = typeof widget.config.html === 'string' ? widget.config.html : ''

  const srcDoc = useMemo(() => {
    const base = `<style>${themeCss()}</style>`
    if (/<html[\s>]/i.test(html)) {
      return /<head[\s>]/i.test(html) ? html.replace(/<head([^>]*)>/i, `<head$1>${base}`) : html.replace(/<html([^>]*)>/i, `<html$1><head>${base}</head>`)
    }
    return `<!doctype html><html><head><meta charset="utf-8">${base}</head><body>${html}</body></html>`
    // The theme value is read through the DOM, so re-run when it changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [html, theme])

  if (!html) return <p className="p-3 text-[12px] text-ink-3">Este widget no tiene contenido.</p>

  return <iframe title={widget.title} sandbox="allow-scripts" srcDoc={srcDoc} className="h-full w-full border-0 bg-transparent" />
}
