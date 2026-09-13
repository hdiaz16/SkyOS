import type { ReactNode } from 'react'
import { cn } from '../lib/utils'

interface Props {
  label: string
  onClick: () => void
  disabled?: boolean
  active?: boolean
  children: ReactNode
}

/** Small icon button for window toolbars. */
export function ToolButton({ label, onClick, disabled, active, children }: Props) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-2 transition hover:bg-surface-2 hover:text-ink active:scale-95 disabled:opacity-30 disabled:hover:bg-transparent',
        active && 'bg-surface-2 text-ink',
      )}
    >
      {children}
    </button>
  )
}
