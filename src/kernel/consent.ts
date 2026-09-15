import { useAuth } from '../system/auth'
import { useDialog } from '../state/dialog'

/**
 * The gate in front of anything Sky does that would be hard to take back.
 *
 * The system prompt asks the model to check before big or irreversible actions, and a well-behaved model does.
 * A prompt is not a control: a document dropped on the desktop can carry instructions, and a model can simply
 * be wrong. So the rule lives here, in the path every tool call has to go through, and it holds whatever the
 * model was told or talked into.
 *
 * What the person does with their own hands is never gated — they are the one deciding.
 */

export type Risk =
  /** Looks at something and changes nothing. */
  | 'read'
  /** Changes this device, and the journal can put it back. */
  | 'write'
  /** Changes this device for good: nothing here can undo it. */
  | 'destructive'
  /** Leaves this device. Whatever happens on the other side stays happened. */
  | 'external'

/** More than a handful of things at once stops being a small change, whatever the preference says. */
export const BULK = 10

export interface Consent {
  /** What is about to happen, phrased as the question it is. */
  title: string
  /** How many things it touches; one, unless the command says otherwise. */
  count?: number
  /** Said under the question, when there is something worth adding. */
  detail?: string
}

const plural = (n: number) => `${n} ${n === 1 ? 'elemento' : 'elementos'}`

/**
 * Whether Sky may go ahead. Returns false when the person says no, and the caller must then do nothing at all
 * — a half-done action is worse than one that never started.
 */
export async function allowed(risk: Risk, ask: Consent): Promise<boolean> {
  if (risk === 'read') return true
  const autonomy = useAuth.getState().current?.profile.autonomy ?? 'act'
  const count = ask.count ?? 1
  const bulk = count > BULK
  const irreversible = risk === 'destructive' || risk === 'external'
  // "Act and tell me" still stops for what cannot be undone and for anything at scale; the other two
  // preferences stop for every change, which is what the person asked for when they chose them.
  if (!irreversible && !bulk && autonomy === 'act') return true

  const detail = [
    count > 1 ? plural(count) : '',
    ask.detail ?? (risk === 'external' ? 'Ocurre fuera de este equipo: desde aquí no se puede deshacer.' : risk === 'destructive' ? 'No se puede deshacer.' : 'Se puede deshacer después.'),
  ]
    .filter(Boolean)
    .join(' · ')

  const answer = await useDialog.getState().confirm({
    title: ask.title,
    description: detail,
    confirmLabel: irreversible ? 'Sí, hazlo' : 'Adelante',
    danger: irreversible,
  })
  return answer
}

/** What the model is told when the person says no, so it stops instead of trying another way in. */
export const DECLINED = 'La persona no autorizó esta acción. No la intentes de otra forma; pregúntale qué prefiere.'
