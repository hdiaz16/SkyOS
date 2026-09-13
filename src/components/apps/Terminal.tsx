import { useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useTerminal, type TerminalLine } from '../../ai/terminal'
import { isAiConfigured, useAiSettings } from '../../ai/settings'
import { cn } from '../../lib/utils'

const LINE_CLASS: Record<TerminalLine['kind'], string> = {
  input: 'text-ink',
  output: 'text-ink',
  tool: 'text-ink-3',
  error: 'text-danger',
  system: 'text-ink-2',
}

export function TerminalApp() {
  const lines = useTerminal((s) => s.lines)
  const running = useTerminal((s) => s.running)
  const run = useTerminal((s) => s.run)
  const stop = useTerminal((s) => s.stop)
  const aiReady = isAiConfigured(useAiSettings())
  const [draft, setDraft] = useState('')
  const [cursor, setCursor] = useState(-1)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [lines])

  const inputs = lines.filter((l) => l.kind === 'input').map((l) => l.text)

  const submit = () => {
    if (!draft.trim()) return
    void run(draft)
    setDraft('')
    setCursor(-1)
  }

  return (
    <div className="flex h-full flex-col bg-surface-solid/60 font-mono text-[12.5px] leading-5" onClick={() => inputRef.current?.focus()}>
      <div ref={scrollRef} className="scrollbar-thin min-h-0 flex-1 select-text overflow-y-auto px-4 py-3">
        {lines.map((l) => (
          <div key={l.id} className={cn('whitespace-pre-wrap break-words', LINE_CLASS[l.kind], l.kind === 'input' && 'mt-2 first:mt-0')}>
            {l.kind === 'input' ? (
              <>
                <span className="text-accent">&gt; </span>
                {l.text}
              </>
            ) : (
              l.text || (running ? <span className="animate-pulse text-ink-3">…</span> : null)
            )}
          </div>
        ))}
        {!aiReady && <div className="mt-2 text-ink-3">Configura la IA en Ajustes para usar la terminal.</div>}
      </div>
      <form
        className="flex h-10 shrink-0 items-center gap-2 border-t border-line px-4"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <span className="text-accent">&gt;</span>
        <input
          ref={inputRef}
          autoFocus
          value={draft}
          disabled={!aiReady}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.key === 'ArrowUp' && inputs.length) {
              e.preventDefault()
              const next = cursor < 0 ? inputs.length - 1 : Math.max(0, cursor - 1)
              setCursor(next)
              setDraft(inputs[next])
            } else if (e.key === 'ArrowDown' && cursor >= 0) {
              e.preventDefault()
              const next = cursor + 1
              if (next >= inputs.length) {
                setCursor(-1)
                setDraft('')
              } else {
                setCursor(next)
                setDraft(inputs[next])
              }
            } else if (e.key === 'c' && e.ctrlKey && running) {
              e.preventDefault()
              stop()
            }
          }}
          placeholder={running ? 'Ejecutando… (Ctrl+C para detener)' : 'Escribe una petición y presiona Enter'}
          spellCheck={false}
          className="min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-ink-3 disabled:opacity-50"
        />
        {running && <Loader2 className="h-3.5 w-3.5 animate-spin text-ink-3" />}
      </form>
    </div>
  )
}
