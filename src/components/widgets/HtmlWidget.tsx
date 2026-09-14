import type { Widget } from '../../kernel/widgets'
import { HtmlSandbox } from '../HtmlSandbox'

/** A widget whose whole body is HTML that Sky wrote, rendered in isolation. */
export function HtmlWidget({ widget }: { widget: Widget }) {
  const html = typeof widget.config.html === 'string' ? widget.config.html : ''
  if (!html) return <p className="p-3 text-[12px] text-ink-3">Este widget no tiene contenido.</p>
  return <HtmlSandbox html={html} title={widget.title} />
}
