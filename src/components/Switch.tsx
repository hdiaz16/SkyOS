import { cn } from '../lib/utils'

/** The system's one switch: a pill that slides. Off is quiet, on is the accent; disabled says so by fading. */
export function Switch({ checked, onChange, disabled, label }: { checked: boolean; onChange: (next: boolean) => void; disabled?: boolean; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn('relative h-6 w-11 shrink-0 rounded-full transition disabled:cursor-not-allowed disabled:opacity-40', checked ? 'bg-accent' : 'bg-line-2')}
    >
      <span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-soft transition', checked ? 'left-[22px]' : 'left-0.5')} />
    </button>
  )
}
