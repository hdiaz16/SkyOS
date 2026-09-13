import { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { fs } from '../../kernel/fs'
import { useWindows, type Win } from '../../state/windows'

type Status = 'saved' | 'dirty' | 'saving'

export function TextEditor({ win }: { win: Win }) {
  const nodeId = win.props.nodeId ?? ''
  const node = useLiveQuery(() => fs.get(nodeId), [nodeId])
  const [text, setText] = useState<string | null>(null)
  const [status, setStatus] = useState<Status>('saved')
  const latest = useRef({ text: '', dirty: false })
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => {
    let alive = true
    fs.readText(nodeId).then((t) => {
      if (!alive) return
      setText(t)
      latest.current = { text: t, dirty: false }
    })
    return () => {
      alive = false
    }
  }, [nodeId])

  useEffect(() => {
    if (node?.name) useWindows.getState().setTitle(win.id, node.name)
  }, [node?.name, win.id])

  // Flush pending changes when the window closes.
  useEffect(
    () => () => {
      window.clearTimeout(timer.current)
      if (latest.current.dirty) void fs.writeText(nodeId, latest.current.text)
    },
    [nodeId],
  )

  const onChange = (value: string) => {
    setText(value)
    latest.current = { text: value, dirty: true }
    setStatus('dirty')
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(async () => {
      setStatus('saving')
      await fs.writeText(nodeId, latest.current.text)
      latest.current.dirty = false
      setStatus('saved')
    }, 600)
  }

  const words = useMemo(() => (text ? text.trim().split(/\s+/).filter(Boolean).length : 0), [text])

  if (text === null) {
    return <div className="flex h-full items-center justify-center text-[13px] text-ink-3">Abriendo…</div>
  }

  return (
    <div className="flex h-full flex-col">
      <textarea
        value={text}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.stopPropagation()}
        spellCheck={false}
        placeholder="Escribe algo…"
        className="scrollbar-thin flex-1 resize-none bg-transparent px-8 py-6 text-[15px] leading-7 text-ink outline-none placeholder:text-ink-3"
      />
      <div className="flex h-8 shrink-0 items-center justify-between border-t border-line px-4 text-[11px] text-ink-3">
        <span>
          {words} {words === 1 ? 'palabra' : 'palabras'}
        </span>
        <span>{status === 'saved' ? 'Guardado' : status === 'saving' ? 'Guardando…' : 'Sin guardar'}</span>
      </div>
    </div>
  )
}
