import { sessionSuffix } from '../system/session'

/**
 * The desk follows the day. Instead of one palette fixed at install, the sky, the light and the hills take the
 * colour of the hour: the sage and sand of a morning in the field, a bluer noon, gold in the afternoon, the
 * sunset, the blue hour, moonlight. Between two anchors the colours mix minute by minute, so nobody sees a
 * change happen — only that it is later than it was. The anchors hang from sunrise and sunset, which the weather
 * widget learns for where the person is; without that, a day of the Mexican plateau.
 */

export type Phase = 'alba' | 'mañana' | 'mediodía' | 'tarde' | 'ocaso' | 'anochecer' | 'noche'

/** «Ahora … en el escritorio». */
export const PHASE_LABEL: Record<Phase, string> = {
  alba: 'está amaneciendo',
  mañana: 'es por la mañana',
  mediodía: 'es mediodía',
  tarde: 'es por la tarde',
  ocaso: 'está atardeciendo',
  anochecer: 'está anocheciendo',
  noche: 'es de noche',
}

/** The eight colours the stylesheet reads, plus where the sun (or the moon) is, in percent of the screen. */
export interface Palette {
  bgA: string
  bgB: string
  bgC: string
  blob1: string
  blob2: string
  blob3: string
  hill1: string
  hill2: string
  sunX: number
  sunY: number
}

/** Minutes after local midnight. */
export interface SunTimes {
  sunrise: number
  sunset: number
}

export const DEFAULT_SUN: SunTimes = { sunrise: 6 * 60 + 30, sunset: 19 * 60 + 30 }

const MINUTES = 24 * 60

type Look = Omit<Palette, 'sunX' | 'sunY'>

const look = (bgA: string, bgB: string, bgC: string, blob1: string, blob2: string, blob3: string, hill1: string, hill2: string): Look => ({ bgA, bgB, bgC, blob1, blob2, blob3, hill1, hill2 })

/**
 * The light theme, one palette per anchor. The paper stays light enough for the dark ink at every hour; the light,
 * the sky and the hills are where the hour shows — a first version kept them so close to the morning that at dusk
 * the desk read as plain light grey, and nobody could tell a sunset from a Tuesday noon.
 */
const LIGHT: Record<Phase, Look> = {
  // Dawn: rose low in the sky, peach where the sun is about to be, lilac above.
  alba: look('#f3e4e8', '#fbeedd', '#e6def0', '#e9a6b6', '#f7c185', '#c2b0e6', '#dcc0c9', '#c9adb8'),
  // A morning in the field: the palette Sky was born with (the stylesheet's own values).
  mañana: look('#e8eee8', '#f1eee6', '#dfe9e6', '#b9d4b3', '#cfe1ea', '#f3e2c4', '#dbe5db', '#cfdccf'),
  // The sky opens: a real blue overhead, the green of the hills cooler, the sun white.
  mediodía: look('#e2edf5', '#f4f2e8', '#cde2f3', '#9dd0b3', '#86c3ef', '#fbf0cc', '#cbdfd2', '#b7cfc0'),
  // Gold comes in low over the grass.
  tarde: look('#f5e9d6', '#f8efdf', '#f0dfc2', '#d8c46a', '#e6c79a', '#f6c15f', '#dcc89f', '#cbb384'),
  // Sunset: orange on the horizon, pink above it, the first violet.
  ocaso: look('#f5dcd0', '#f7e4d4', '#eec8c6', '#f2965e', '#ea8aa2', '#af8ccb', '#d9a58b', '#c28a75'),
  // The blue hour: indigo and violet, the last warmth going out.
  anochecer: look('#d9d8ea', '#e1ddec', '#cbcce6', '#7a86c8', '#a389cf', '#e9b49a', '#b4b7d4', '#9ea3c4'),
  // Night: slate under moonlight, still paper enough for the ink.
  noche: look('#d0d6e3', '#d8dae6', '#c2cadf', '#657aae', '#8580bd', '#d4dbe2', '#a9b2c8', '#939db6'),
}

/** The dark theme: the same hours in the depth of the night forest the stylesheet already had, each with its own light. */
const DARK: Record<Phase, Look> = {
  alba: look('#15121b', '#1d1618', '#161424', '#5a3452', '#6e4436', '#4a4a30', '#141118', '#0f0c13'),
  mañana: look('#0e1512', '#121b17', '#101a1c', '#1e3b30', '#1a2538', '#2b3a33', '#0d1411', '#0a100e'),
  mediodía: look('#0e161a', '#121a1e', '#0f1c25', '#1f4a3c', '#1f3f63', '#3a4a44', '#0d1417', '#0a1013'),
  tarde: look('#16150f', '#1c1a12', '#1a1710', '#4a4a1f', '#3a3040', '#5a4a1c', '#14120c', '#100e09'),
  ocaso: look('#1a110e', '#211512', '#1e1412', '#6b3a22', '#6e2f3a', '#3d2a52', '#1a1010', '#140d0c'),
  anochecer: look('#0f121e', '#141624', '#0f1526', '#243a7a', '#3a2e66', '#3a2e34', '#0e1019', '#0a0c13'),
  noche: look('#0a0e18', '#0e121c', '#0a101c', '#182a55', '#241f44', '#2a3038', '#0a0d14', '#07090e'),
}

/** Where the warm light sits at each anchor: it rises on the left, crosses high, sets on the right; the moon keeps the night high on the right. */
const SUN: Record<Phase, { x: number; y: number }> = {
  alba: { x: 8, y: 78 },
  mañana: { x: 26, y: 34 },
  mediodía: { x: 50, y: 4 },
  tarde: { x: 72, y: 30 },
  ocaso: { x: 92, y: 72 },
  anochecer: { x: 84, y: 42 },
  noche: { x: 78, y: 12 },
}

export interface Anchor {
  /** Minutes after midnight, wrapped into the day. */
  at: number
  phase: Phase
}

const wrap = (minute: number): number => ((minute % MINUTES) + MINUTES) % MINUTES

/**
 * When each anchor falls, hung from sunrise and sunset. The night is held with a second anchor before dawn so
 * the small hours stay night instead of sliding back toward the sunset colours.
 */
export function anchors(sun: SunTimes = DEFAULT_SUN): Anchor[] {
  const rise = sun.sunrise
  const setAt = sun.sunset
  const list: Anchor[] = [
    { at: rise - 90, phase: 'noche' },
    { at: rise - 20, phase: 'alba' },
    { at: rise + 120, phase: 'mañana' },
    { at: (rise + setAt) / 2, phase: 'mediodía' },
    { at: setAt - 150, phase: 'tarde' },
    { at: setAt, phase: 'ocaso' },
    { at: setAt + 70, phase: 'anochecer' },
    { at: setAt + 180, phase: 'noche' },
  ]
  return list.map((a) => ({ ...a, at: wrap(a.at) })).sort((a, b) => a.at - b.at)
}

/** The two anchors around a minute and how far along it is, the day treated as a circle. */
function segment(minute: number, sun: SunTimes): { from: Anchor; to: Anchor; t: number } {
  const list = anchors(sun)
  const m = wrap(minute)
  let i = list.findIndex((a, idx) => m >= a.at && m < (list[idx + 1]?.at ?? Infinity))
  // Before the first anchor of the day: still inside the segment that wraps around from the last one.
  if (i === -1) i = list.length - 1
  const from = list[i]
  const to = list[(i + 1) % list.length]
  const span = wrap(to.at - from.at) || MINUTES
  return { from, to, t: Math.min(1, wrap(m - from.at) / span) }
}

/** The name of the hour: the anchor whose colours are closest to what is on screen. */
export function phaseAt(minute: number, sun: SunTimes = DEFAULT_SUN): Phase {
  const { from, to, t } = segment(minute, sun)
  return t < 0.5 ? from.phase : to.phase
}

const rgb = (c: string): [number, number, number] => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]
const channel = (n: number): string => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, '0')

/** A colour between two, as far along as t (0 is a, 1 is b). */
export function mix(a: string, b: string, t: number): string {
  if (t <= 0) return a
  if (t >= 1) return b
  const [r1, g1, b1] = rgb(a)
  const [r2, g2, b2] = rgb(b)
  return `#${channel(r1 + (r2 - r1) * t)}${channel(g1 + (g2 - g1) * t)}${channel(b1 + (b2 - b1) * t)}`
}

/** Smoothstep: the colours linger at each anchor and move between them, the way light does. */
const ease = (t: number): number => t * t * (3 - 2 * t)

/** The colours for a minute of the day, in the light or the dark theme. */
export function paletteAt(minute: number, dark: boolean, sun: SunTimes = DEFAULT_SUN): Palette {
  const { from, to, t } = segment(minute, sun)
  const looks = dark ? DARK : LIGHT
  const a = looks[from.phase]
  const b = looks[to.phase]
  const k = ease(t)
  const sa = SUN[from.phase]
  const sb = SUN[to.phase]
  return {
    bgA: mix(a.bgA, b.bgA, k),
    bgB: mix(a.bgB, b.bgB, k),
    bgC: mix(a.bgC, b.bgC, k),
    blob1: mix(a.blob1, b.blob1, k),
    blob2: mix(a.blob2, b.blob2, k),
    blob3: mix(a.blob3, b.blob3, k),
    hill1: mix(a.hill1, b.hill1, k),
    hill2: mix(a.hill2, b.hill2, k),
    sunX: sa.x + (sb.x - sa.x) * k,
    sunY: sa.y + (sb.y - sa.y) * k,
  }
}

export const minuteOf = (date: Date): number => date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60

/* ---------- the sun where the person is ---------- */

const SUN_KEY = (): string => `mesa:sun${sessionSuffix()}`

/** Two days: enough to survive a weekend offline, short enough that the seasons keep moving. */
const SUN_TTL_MS = 2 * 24 * 60 * 60 * 1000

const minutesOfIso = (iso: string): number | undefined => {
  const m = /T(\d{2}):(\d{2})/.exec(iso)
  return m ? Number(m[1]) * 60 + Number(m[2]) : undefined
}

/** What the weather widget learned about today's sun where the person is (Open-Meteo local ISO times); kept for the next visits. */
export function rememberSun(sunrise?: string, sunset?: string): void {
  const rise = sunrise ? minutesOfIso(sunrise) : undefined
  const setAt = sunset ? minutesOfIso(sunset) : undefined
  if (rise === undefined || setAt === undefined || setAt <= rise) return
  try {
    localStorage.setItem(SUN_KEY(), JSON.stringify({ sunrise: rise, sunset: setAt, at: Date.now() }))
  } catch {
    /* storage unavailable */
  }
  repaint?.()
}

export function readSun(): SunTimes {
  try {
    const raw = localStorage.getItem(SUN_KEY())
    if (!raw) return DEFAULT_SUN
    const v = JSON.parse(raw) as { sunrise?: number; sunset?: number; at?: number }
    if (typeof v.sunrise !== 'number' || typeof v.sunset !== 'number' || typeof v.at !== 'number') return DEFAULT_SUN
    if (Date.now() - v.at > SUN_TTL_MS || v.sunset <= v.sunrise) return DEFAULT_SUN
    return { sunrise: v.sunrise, sunset: v.sunset }
  } catch {
    return DEFAULT_SUN
  }
}

/* ---------- painting the root ---------- */

const VARS: Array<[keyof Look, string]> = [
  ['bgA', '--bg-a'],
  ['bgB', '--bg-b'],
  ['bgC', '--bg-c'],
  ['blob1', '--blob-1'],
  ['blob2', '--blob-2'],
  ['blob3', '--blob-3'],
  ['hill1', '--hill-1'],
  ['hill2', '--hill-2'],
]

/** Writes a palette on the root element, where the stylesheet reads it; inline, so it wins over the fixed backdrops. */
export function paintPalette(root: HTMLElement, palette: Palette): void {
  for (const [key, name] of VARS) root.style.setProperty(name, palette[key])
  root.style.setProperty('--sun-x', `${palette.sunX.toFixed(2)}%`)
  root.style.setProperty('--sun-y', `${palette.sunY.toFixed(2)}%`)
}

export function clearPalette(root: HTMLElement): void {
  for (const [, name] of VARS) root.style.removeProperty(name)
  root.style.removeProperty('--sun-x')
  root.style.removeProperty('--sun-y')
}

let timer: number | undefined
let repaint: (() => void) | undefined

/**
 * Keeps the root painted with the hour: now, then every minute, and again whenever the tab comes back (a laptop
 * opened the next morning should not wake up in last night's colours). Off, it stops the clock and hands the
 * colours back to the stylesheet.
 */
export function followDaylight(isDark: () => boolean, on = true): void {
  if (timer !== undefined) {
    window.clearInterval(timer)
    timer = undefined
  }
  if (repaint) {
    document.removeEventListener('visibilitychange', repaint)
    repaint = undefined
  }
  const root = document.documentElement
  if (!on) {
    clearPalette(root)
    return
  }
  const paint = () => {
    if (document.hidden) return
    paintPalette(root, paletteAt(minuteOf(new Date()), isDark(), readSun()))
  }
  repaint = paint
  paint()
  timer = window.setInterval(paint, 60_000)
  document.addEventListener('visibilitychange', paint)
}
