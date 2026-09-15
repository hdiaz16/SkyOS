import { Loader2, RotateCcw, Trash2, X } from 'lucide-react'
import { dispatch } from '../../kernel/commands'
import { useWindows } from '../../state/windows'
import type { FileStatus } from '../../lib/hooks'

/**
 * What a window says when it is still opening, and when what it was opening is not there any more. A person who
 * lost a file deserves the way back, not a spinner that never ends.
 */

export function Opening({ what = 'Abriendo…' }: { what?: string }) {
  return (
    <div className="flex h-full items-center justify-center gap-2 text-[13px] text-ink-3">
      <Loader2 className="h-4 w-4 animate-spin" />
      {what}
    </div>
  )
}

/** The end of the road for a window whose file went away: what happened, and the one thing left to do about it. */
export function FileMissing({ winId, nodeId, status, name }: { winId: string; nodeId: string; status: FileStatus; name?: string }) {
  const trashed = status === 'trashed'
  const close = () => useWindows.getState().close(winId)
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-2 text-ink-3">
        <Trash2 className="h-5 w-5" />
      </span>
      <div>
        <p className="text-[14px] text-ink-2">{trashed ? `${name ?? 'Este archivo'} está en la papelera` : `${name ?? 'Este archivo'} ya no está aquí`}</p>
        <p className="mt-0.5 text-[12px] text-ink-3">{trashed ? 'Puedes sacarlo y seguir donde ibas.' : 'Se eliminó definitivamente o se fue con otra cuenta.'}</p>
      </div>
      <div className="flex items-center gap-2">
        {trashed && (
          <button
            type="button"
            onClick={() => void dispatch('fs.restore', { ids: [nodeId] })}
            className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-[12.5px] font-medium text-white transition hover:brightness-110"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Restaurar
          </button>
        )}
        <button
          type="button"
          onClick={close}
          className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-[12.5px] text-ink-2 transition hover:border-line-2 hover:text-ink"
        >
          <X className="h-3.5 w-3.5" />
          Cerrar ventana
        </button>
      </div>
    </div>
  )
}
