import { useEffect, useState } from 'react'
import { AlertCircle, Loader2 } from 'lucide-react'
import { useSettings } from '../state/settings'
import { cn } from '../lib/utils'

type MermaidApi = (typeof import('mermaid'))['default']

let loading: Promise<MermaidApi> | null = null
let seq = 0

/** The diagram library is heavy, so it arrives the first time a diagram shows up, and stays. */
function loadMermaid(): Promise<MermaidApi> {
  // The rejected promise used to be cached too: one moment without network and every diagram of the session
  // showed the same English fetch error, never retried. The failure is not kept; the next diagram tries again.
  loading ??= import('mermaid')
    .then((m) => m.default)
    .catch((err: unknown) => {
      loading = null
      throw err
    })
  return loading
}

/** Diagram colors from the live palette, so a chart looks native in both themes. */
function palette(dark: boolean): Record<string, string> {
  const cs = getComputedStyle(document.documentElement)
  const v = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback
  return {
    background: 'transparent',
    primaryColor: v('--accent-soft', dark ? '#1f3a2e' : '#e3f0e8'),
    primaryTextColor: v('--ink', dark ? '#e8efe9' : '#1c2a22'),
    primaryBorderColor: v('--accent', '#4a8a68'),
    secondaryColor: v('--surface-2', dark ? '#22302a' : '#f1f5f2'),
    secondaryTextColor: v('--ink', dark ? '#e8efe9' : '#1c2a22'),
    tertiaryColor: v('--surface', dark ? '#182219' : '#ffffff'),
    tertiaryTextColor: v('--ink-2', dark ? '#c7d2ca' : '#3d4a42'),
    lineColor: v('--ink-3', '#7b8a80'),
    textColor: v('--ink', dark ? '#e8efe9' : '#1c2a22'),
    noteBkgColor: v('--surface-2', dark ? '#22302a' : '#f1f5f2'),
    noteTextColor: v('--ink', dark ? '#e8efe9' : '#1c2a22'),
    fontFamily: '"Nunito Variable", ui-sans-serif, system-ui, sans-serif',
    fontSize: '13px',
  }
}

/** Renders Mermaid code as an inline SVG, themed like the desktop. Errors show as one quiet line. */
export function Mermaid({ code, className }: { code: string; className?: string }) {
  const dark = useSettings((s) => s.dark)
  const [svg, setSvg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    const id = `sky-mermaid-${++seq}`
    loadMermaid()
      .then((m) => {
        m.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'base', themeVariables: palette(dark), suppressErrorRendering: true })
        return m.render(id, code.trim())
      })
      .then((r) => {
        if (!alive) return
        setSvg(r.svg)
        setError(null)
      })
      .catch((e: unknown) => {
        if (!alive) return
        // Mermaid's own words are for whoever writes Mermaid: «No diagram type detected matching given
        // configuration for text: hola». The line says what happened; the detail waits in the tooltip.
        setError(e instanceof Error ? e.message.split('\n')[0] : 'No pude dibujar el diagrama')
      })
    return () => {
      alive = false
    }
  }, [code, dark])

  // An empty block is not a mistake, it is a block waiting to be written.
  if (!code.trim()) {
    return <div className={cn('py-4 text-[12px] text-ink-3', className)}>Escribe un diagrama de Mermaid aquí.</div>
  }
  if (error) {
    return (
      <div
        title={error}
        className={cn('flex items-start gap-1.5 rounded-xl border border-danger/30 bg-danger/5 px-3 py-2 text-[12px] text-danger', className)}
      >
        <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span className="min-w-0 break-words">No entendí el diagrama; revisa la sintaxis de Mermaid.</span>
      </div>
    )
  }
  if (!svg) {
    return (
      <div className={cn('flex items-center gap-2 py-4 text-[12px] text-ink-3', className)}>
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Dibujando…
      </div>
    )
  }
  // The SVG comes from mermaid with securityLevel "strict", which sanitizes labels and links.
  return <div className={cn('mermaid-host overflow-auto [&_svg]:mx-auto [&_svg]:h-auto [&_svg]:max-w-full', className)} dangerouslySetInnerHTML={{ __html: svg }} />
}
