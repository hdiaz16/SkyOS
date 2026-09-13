import { useEffect, useRef, useState } from 'react'
import { ExternalLink, House, RotateCw } from 'lucide-react'
import { useWindows, type Win } from '../../state/windows'
import { GOOGLE_HOME, titleForUrl, toNavigableUrl } from '../../lib/web'
import { cn } from '../../lib/utils'
import { ToolButton } from '../ToolButton'

export function BrowserApp({ win }: { win: Win }) {
  const target = win.props.url ?? GOOGLE_HOME
  const [address, setAddress] = useState(target)
  const [loading, setLoading] = useState(true)
  const [nonce, setNonce] = useState(0)
  const lastTarget = useRef(target)

  // Keep the address bar in sync when another command changes the URL of this window.
  useEffect(() => {
    if (target === lastTarget.current) return
    lastTarget.current = target
    setAddress(target)
    setLoading(true)
  }, [target])

  const navigate = (raw: string) => {
    const url = toNavigableUrl(raw)
    const wm = useWindows.getState()
    wm.setProps(win.id, { url })
    wm.setTitle(win.id, titleForUrl(url))
    setNonce((n) => n + 1)
    setLoading(true)
  }

  return (
    <div className="flex h-full flex-col">
      <div className="relative flex h-11 shrink-0 items-center gap-1 border-b border-line px-2">
        <ToolButton label="Inicio (Google)" onClick={() => navigate('')}>
          <House className="h-4 w-4" />
        </ToolButton>
        <ToolButton
          label="Recargar"
          onClick={() => {
            setNonce((n) => n + 1)
            setLoading(true)
          }}
        >
          <RotateCw className={cn('h-4 w-4', loading && 'animate-spin')} />
        </ToolButton>

        <form
          className="flex min-w-0 flex-1 px-1"
          onSubmit={(e) => {
            e.preventDefault()
            navigate(address)
          }}
        >
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            onFocus={(e) => e.currentTarget.select()}
            onKeyDown={(e) => e.stopPropagation()}
            spellCheck={false}
            placeholder="Busca en Google o escribe una dirección"
            className="h-8 w-full rounded-lg bg-surface-2 px-3 text-[13px] text-ink outline-none transition focus:ring-1 focus:ring-accent/50"
          />
        </form>

        <ToolButton label="Abrir en pestaña nueva" onClick={() => window.open(target, '_blank', 'noopener')}>
          <ExternalLink className="h-4 w-4" />
        </ToolButton>

        {loading && (
          <div className="absolute inset-x-0 -bottom-px h-0.5 overflow-hidden">
            <div className="loading-bar h-full w-1/3 rounded-full bg-accent" />
          </div>
        )}
      </div>

      <iframe
        key={nonce}
        src={target}
        title={win.title}
        onLoad={() => setLoading(false)}
        className="min-h-0 flex-1 border-0 bg-white"
        allow="clipboard-write"
      />

      <div className="flex h-7 shrink-0 items-center justify-between gap-4 border-t border-line px-3 text-[11px] text-ink-3">
        <span className="truncate">{target}</span>
        <span className="hidden shrink-0 lg:inline">Si un sitio no carga aquí, ábrelo en una pestaña nueva</span>
      </div>
    </div>
  )
}
