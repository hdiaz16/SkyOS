import type { FileKind } from '../kernel/types'
import { fileIconFor } from '../lib/fileIcons'
import { cn } from '../lib/utils'

/**
 * Soft, two-tone icons for folders and files. Files show the official mark of their program or language
 * on a paper sheet when there is one; otherwise a tinted glyph. Sized by the parent via className.
 */
export function KindIcon({ kind, name, className }: { kind: FileKind; name?: string; className?: string }) {
  if (kind === 'folder') {
    return (
      <svg viewBox="0 0 64 64" className={cn('no-drag drop-shadow-sm', className)} aria-hidden>
        <path d="M6 18a6 6 0 0 1 6-6h13.5a6 6 0 0 1 4.24 1.76L33 17h19a6 6 0 0 1 6 6v25a6 6 0 0 1-6 6H12a6 6 0 0 1-6-6V18Z" fill="var(--folder-2)" />
        <path d="M6 26a6 6 0 0 1 6-6h40a6 6 0 0 1 6 6v22a6 6 0 0 1-6 6H12a6 6 0 0 1-6-6V26Z" fill="var(--folder)" />
        <path d="M6 26a6 6 0 0 1 6-6h40a6 6 0 0 1 6 6v3H6v-3Z" fill="#fff" opacity="0.22" />
      </svg>
    )
  }
  const spec = fileIconFor(name ?? '', kind)
  const Glyph = spec.glyph
  return (
    <div className={cn('no-drag relative flex items-center justify-center', className)} aria-hidden title={spec.label}>
      <svg viewBox="0 0 64 64" className="absolute inset-0 h-full w-full drop-shadow-sm">
        <path d="M14 8a6 6 0 0 1 6-6h20l14 14v38a6 6 0 0 1-6 6H20a6 6 0 0 1-6-6V8Z" fill="var(--surface-solid)" stroke="var(--line-2)" strokeWidth="1.5" />
        <path d="M40 2v10a4 4 0 0 0 4 4h10" fill="none" stroke="var(--line-2)" strokeWidth="1.5" />
        {/* A thin band in the brand color anchors the sheet to its program without shouting. */}
        <path d="M14 50h44v4a6 6 0 0 1-6 6H20a6 6 0 0 1-6-6v-4Z" fill={spec.color} opacity="0.85" />
      </svg>
      {spec.logo ? (
        <img src={`/filetypes/${spec.logo}.svg`} alt="" draggable={false} className="relative h-[44%] w-[44%] translate-y-[2%] object-contain" />
      ) : (
        Glyph && <Glyph className="relative h-[42%] w-[42%] translate-y-[2%]" style={{ color: spec.color }} strokeWidth={1.75} />
      )}
    </div>
  )
}
