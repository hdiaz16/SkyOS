import { useEffect, useRef, useState } from 'react'
import { widgets, type Widget } from '../../kernel/widgets'

export function NoteWidget({ widget }: { widget: Widget }) {
  const stored = typeof widget.config.text === 'string' ? widget.config.text : ''
  const [text, setText] = useState(stored)
  const dirty = useRef(false)
  const timer = useRef<number | undefined>(undefined)
  /** The last thing typed, kept for the unmount flush below. */
  const pending = useRef('')
  const id = useRef(widget.id)

  // Accept external changes (e.g. the AI updating the note) when we are not mid-edit.
  useEffect(() => {
    if (!dirty.current) setText(stored)
  }, [stored])

  useEffect(
    () => () => {
      window.clearTimeout(timer.current)
      // Typing and reloading (or the widget going away) inside that half second used to lose the last
      // words in silence: the note came back with the old text. Whatever is pending is written before going.
      if (dirty.current) void widgets.setConfig(id.current, { text: pending.current })
    },
    [],
  )

  const onChange = (value: string) => {
    setText(value)
    dirty.current = true
    pending.current = value
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(async () => {
      await widgets.setConfig(widget.id, { text: value })
      dirty.current = false
    }, 500)
  }

  return (
    <textarea
      value={text}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => e.stopPropagation()}
      placeholder="Escribe algo…"
      spellCheck={false}
      className="scrollbar-thin h-full w-full resize-none bg-transparent text-[13px] leading-relaxed text-ink outline-none placeholder:text-ink-3"
    />
  )
}
