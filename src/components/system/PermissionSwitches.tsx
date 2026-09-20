import { useEffect, useState } from 'react'
import { BellRing, Loader2, MapPin, Mic } from 'lucide-react'
import { useAuth } from '../../system/auth'
import { users } from '../../system/users'
import type { UserProfile } from '../../system/db'
import { DENIED_NOTE, KEPT_BY_BROWSER_NOTE, PERMISSION_KEYS, askPermission, browserDecision, outcomeNote, permissionPossible, type BrowserDecision, type PermissionKey } from '../../lib/permissions'
import { Switch } from '../Switch'

/**
 * Three switches and one that moves the three. On means Sky asks the browser once and then uses it; off means
 * Sky leaves it alone. A page cannot take a grant back, so off is Sky's promise rather than the browser's, and
 * the note under a blocked one points at the address bar where the browser keeps its own. The same switches
 * live on the card that greets a new desktop and in Ajustes › Cuenta, so what was decided at the door can be
 * changed any day, one at a time or all together.
 */

const ROWS: Array<{ key: PermissionKey; icon: typeof Mic; title: string; why: string }> = [
  { key: 'microphone', icon: Mic, title: 'Micrófono', why: 'Hablarme en lugar de escribir.' },
  { key: 'location', icon: MapPin, title: 'Ubicación exacta', why: 'El clima y la hora de donde estás, no los de tu red.' },
  { key: 'notifications', icon: BellRing, title: 'Notificaciones', why: 'Decirte que un trabajo terminó mientras miras otra pestaña.' },
]

type PerKey<T> = Partial<Record<PermissionKey, T>>

export function PermissionSwitches({ onAllOn }: { onAllOn?: () => void }) {
  const user = useAuth((s) => s.current)
  const [decided, setDecided] = useState<PerKey<BrowserDecision>>({})
  const [asking, setAsking] = useState<PerKey<boolean>>({})
  const [notes, setNotes] = useState<PerKey<string | undefined>>({})

  const keys = PERMISSION_KEYS.filter(permissionPossible)

  // What the browser already knows, so a blocked switch is shown blocked and a granted one on.
  useEffect(() => {
    let alive = true
    void Promise.all(keys.map(async (k) => [k, await browserDecision(k)] as const)).then((pairs) => {
      if (!alive) return
      const next: PerKey<BrowserDecision> = {}
      for (const [k, d] of pairs) next[k] = d
      setDecided(next)
    })
    return () => {
      alive = false
    }
    // Asked again whenever the answers change: the card at the door and the switches in Ajustes can be on screen at
    // the same time, and what one of them just got from the browser the other should see too.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, user?.profile.permissions])

  if (!user) return null
  const prefs = user.profile.permissions ?? {}
  /** The switch's truth: the profile's answer, or, before any answer, what the browser already granted. */
  const isOn = (k: PermissionKey): boolean => prefs[k] ?? decided[k] === 'granted'
  const allOn = keys.length > 0 && keys.every(isOn)
  const busy = Object.values(asking).some(Boolean)

  const save = async (patch: Partial<UserProfile>) => {
    const current = useAuth.getState().current
    if (!current) return
    await users.updateProfile(current.id, patch)
    await useAuth.getState().refreshCurrent()
  }

  const turnOn = async (k: PermissionKey): Promise<boolean> => {
    setAsking((a) => ({ ...a, [k]: true }))
    setNotes((n) => ({ ...n, [k]: undefined }))
    try {
      const outcome = await askPermission(k)
      if (outcome.status === 'granted') {
        const permissions = { ...(useAuth.getState().current?.profile.permissions ?? {}), [k]: true }
        await save({ permissions, ...(k === 'location' && outcome.location ? { location: outcome.location } : {}) })
        setDecided((d) => ({ ...d, [k]: 'granted' }))
        return true
      }
      if (outcome.status === 'denied') setDecided((d) => ({ ...d, [k]: 'denied' }))
      setNotes((n) => ({ ...n, [k]: outcomeNote(outcome) }))
      return false
    } finally {
      setAsking((a) => ({ ...a, [k]: false }))
    }
  }

  const turnOff = async (k: PermissionKey) => {
    const permissions = { ...(useAuth.getState().current?.profile.permissions ?? {}), [k]: false }
    // Off is Sky's side of it: the precise place goes, and the browser keeps whatever it granted.
    await save({ permissions, ...(k === 'location' ? { location: undefined } : {}) })
    setNotes((n) => ({ ...n, [k]: decided[k] === 'granted' ? KEPT_BY_BROWSER_NOTE : undefined }))
  }

  const toggle = async (k: PermissionKey, next: boolean) => {
    if (!next) return turnOff(k)
    const ok = await turnOn(k)
    if (ok && keys.every((other) => other === k || isOn(other))) onAllOn?.()
  }

  const toggleAll = async (next: boolean) => {
    if (!next) {
      for (const k of keys) if (isOn(k)) await turnOff(k)
      return
    }
    // One browser question after another, never two prompts at once.
    let all = true
    for (const k of keys) {
      if (isOn(k)) continue
      if (decided[k] === 'denied') {
        all = false
        continue
      }
      if (!(await turnOn(k))) all = false
    }
    if (all) onAllOn?.()
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-3 rounded-xl bg-surface-2 px-3 py-2">
        <div className="min-w-0">
          <p className="text-[13px] text-ink">Todo</p>
          <p className="text-[11.5px] leading-relaxed text-ink-3">{allOn ? 'Los tres encendidos.' : 'Los tres de una vez; el navegador pregunta uno por uno.'}</p>
        </div>
        {busy ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-ink-3" /> : <Switch checked={allOn} disabled={keys.length === 0} onChange={(v) => void toggleAll(v)} label="Todos los permisos" />}
      </div>
      <ul className="flex flex-col gap-2.5">
        {ROWS.filter((r) => keys.includes(r.key)).map(({ key, icon: Icon, title, why }) => {
          const blocked = decided[key] === 'denied' && !isOn(key)
          const note = notes[key] ?? (blocked ? DENIED_NOTE : undefined)
          return (
            <li key={key} className="flex items-start gap-2.5">
              <Icon className="mt-0.5 h-4 w-4 shrink-0 text-ink-2" />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] text-ink">{title}</p>
                <p className="text-[12px] leading-relaxed text-ink-3">{why}</p>
                {note && <p className="mt-0.5 text-[11.5px] leading-relaxed text-ink-3">{note}</p>}
              </div>
              {asking[key] ? (
                <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-ink-3" />
              ) : (
                <Switch checked={isOn(key)} disabled={blocked || busy} onChange={(v) => void toggle(key, v)} label={title} />
              )}
            </li>
          )
        })}
      </ul>
      {keys.length === 0 && <p className="text-[12px] text-ink-3">Este navegador no permite pedir ninguno de los tres.</p>}
    </div>
  )
}
