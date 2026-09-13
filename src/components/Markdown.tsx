import { Fragment, type ReactNode } from 'react'

/**
 * Small Markdown renderer for assistant replies. Produces React elements (never raw HTML), so model
 * output cannot inject markup. Supports headings, paragraphs, bullet and numbered lists, code blocks,
 * inline code, bold, italics and links.
 */

function renderInline(text: string, key: string): ReactNode {
  const out: ReactNode[] = []
  const re = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*]+\*)|(\[[^\]]+\]\((https?:\/\/[^)\s]+)\))/g
  let last = 0
  let i = 0
  for (const m of text.matchAll(re)) {
    const idx = m.index ?? 0
    if (idx > last) out.push(text.slice(last, idx))
    const token = m[0]
    if (m[1]) out.push(<code key={`${key}-${i}`} className="rounded bg-surface-2 px-1 py-px font-mono text-[12.5px]">{token.slice(1, -1)}</code>)
    else if (m[2]) out.push(<strong key={`${key}-${i}`} className="font-semibold">{token.slice(2, -2)}</strong>)
    else if (m[3]) out.push(<em key={`${key}-${i}`}>{token.slice(1, -1)}</em>)
    else if (m[4]) {
      const label = token.slice(1, token.indexOf(']'))
      out.push(
        <a key={`${key}-${i}`} href={m[5]} target="_blank" rel="noopener noreferrer" className="text-accent underline decoration-accent/40 underline-offset-2">
          {label}
        </a>,
      )
    }
    last = idx + token.length
    i++
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

type Block =
  | { kind: 'p'; text: string }
  | { kind: 'h'; level: number; text: string }
  | { kind: 'ul'; items: string[] }
  | { kind: 'ol'; items: string[] }
  | { kind: 'code'; text: string }

function parse(src: string): Block[] {
  const lines = src.replace(/\r\n/g, '\n').split('\n')
  const blocks: Block[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim()) {
      i++
      continue
    }
    if (line.startsWith('```')) {
      const buf: string[] = []
      i++
      while (i < lines.length && !lines[i].startsWith('```')) buf.push(lines[i++])
      i++
      blocks.push({ kind: 'code', text: buf.join('\n') })
      continue
    }
    const h = line.match(/^(#{1,4})\s+(.*)$/)
    if (h) {
      blocks.push({ kind: 'h', level: h[1].length, text: h[2] })
      i++
      continue
    }
    if (/^\s*[-*•]\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\s*[-*•]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*[-*•]\s+/, ''))
      blocks.push({ kind: 'ul', items })
      continue
    }
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*\d+[.)]\s+/, ''))
      blocks.push({ kind: 'ol', items })
      continue
    }
    const buf: string[] = []
    while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|```|\s*[-*•]\s|\s*\d+[.)]\s)/.test(lines[i])) buf.push(lines[i++])
    blocks.push({ kind: 'p', text: buf.join(' ') })
  }
  return blocks
}

export function Markdown({ text, className }: { text: string; className?: string }) {
  const blocks = parse(text)
  return (
    <div className={className}>
      {blocks.map((b, i) => {
        const key = `b${i}`
        switch (b.kind) {
          case 'h': {
            const size = b.level === 1 ? 'text-[16px]' : b.level === 2 ? 'text-[15px]' : 'text-[14px]'
            return (
              <p key={key} className={`${size} mb-1 mt-2 font-semibold first:mt-0`}>
                {renderInline(b.text, key)}
              </p>
            )
          }
          case 'ul':
            return (
              <ul key={key} className="my-1 list-disc space-y-0.5 pl-5">
                {b.items.map((it, j) => (
                  <li key={j}>{renderInline(it, `${key}-${j}`)}</li>
                ))}
              </ul>
            )
          case 'ol':
            return (
              <ol key={key} className="my-1 list-decimal space-y-0.5 pl-5">
                {b.items.map((it, j) => (
                  <li key={j}>{renderInline(it, `${key}-${j}`)}</li>
                ))}
              </ol>
            )
          case 'code':
            return (
              <pre key={key} className="scrollbar-thin my-1.5 overflow-x-auto rounded-lg bg-surface-2 p-3 font-mono text-[12.5px] leading-5">
                {b.text}
              </pre>
            )
          default:
            return (
              <p key={key} className="my-1 first:mt-0 last:mb-0">
                <Fragment>{renderInline(b.text, key)}</Fragment>
              </p>
            )
        }
      })}
    </div>
  )
}
