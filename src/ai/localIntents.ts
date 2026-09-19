/** Deterministic, deliberately narrow answers that do not need a model or network. */
export interface LocalIntentContext {
  now?: Date
  locale?: string
  timeZone?: string
  theme?: string
  windowCount?: number
}

export interface LocalIntentResult {
  text: string
  kind: 'time' | 'date' | 'date_time' | 'theme' | 'window_count'
}

export function normalizeLocalIntent(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[¿?¡!.,;:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Matches only complete, single-purpose questions.  Falling through to the agent is safer than trying to
 * be clever here: "la hora en Tokio" and "dime la hora y abre…" must retain their full capabilities.
 */
export function resolveLocalIntent(prompt: string, context: LocalIntentContext = {}): LocalIntentResult | null {
  const value = normalizeLocalIntent(prompt)
  if (!value) return null
  const now = context.now ?? new Date()
  const locale = context.locale ?? (typeof navigator !== 'undefined' ? navigator.language : undefined) ?? 'es-MX'
  const timeZone = context.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone
  const format = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(locale, { ...options, timeZone }).format(now)

  if (/^(que hora es|dime la hora|hora actual|hora)$/.test(value)) {
    return { kind: 'time', text: `Son las ${format({ hour: '2-digit', minute: '2-digit', hour12: false })}.` }
  }
  if (/^(que fecha es|que dia es|fecha actual|dia actual|fecha|dia)$/.test(value)) {
    return { kind: 'date', text: `Hoy es ${format({ weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}.` }
  }
  if (/^(que hora y fecha es|que fecha y hora es|fecha y hora actual|hora y fecha actual)$/.test(value)) {
    return {
      kind: 'date_time',
      text: `Hoy es ${format({ weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })}.`,
    }
  }
  if (/^(que tema (tengo|esta activo)|tema actual|tema)$/.test(value) && context.theme) {
    return { kind: 'theme', text: `El tema activo es ${context.theme}.` }
  }
  if (/^(cuantas ventanas (hay|estan abiertas)|numero de ventanas abiertas|ventanas abiertas)$/.test(value) && context.windowCount !== undefined) {
    const n = context.windowCount
    return { kind: 'window_count', text: `Hay ${n} ${n === 1 ? 'ventana abierta' : 'ventanas abiertas'}.` }
  }
  return null
}
