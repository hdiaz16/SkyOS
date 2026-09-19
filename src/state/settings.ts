import { create } from 'zustand'
import { sessionSuffix } from '../system/session'

export type Theme = 'system' | 'light' | 'dark'

/** The colour of what is chosen and pressed: sage by default, the others the same palette with another ink. */
export type Accent = 'salvia' | 'cielo' | 'arena' | 'lavanda' | 'coral'
/** The hour of the day behind the desk: the same suns and hills, another light. */
export type Backdrop = 'campo' | 'mar' | 'atardecer' | 'bosque'

export const ACCENTS: { value: Accent; label: string; swatch: string }[] = [
  { value: 'salvia', label: 'Salvia', swatch: '#3d7a5a' },
  { value: 'cielo', label: 'Cielo', swatch: '#3f7ea6' },
  { value: 'arena', label: 'Arena', swatch: '#a67c3f' },
  { value: 'lavanda', label: 'Lavanda', swatch: '#7b6aa8' },
  { value: 'coral', label: 'Coral', swatch: '#b9614f' },
]

export const BACKDROPS: { value: Backdrop; label: string }[] = [
  { value: 'campo', label: 'Campo' },
  { value: 'mar', label: 'Mar' },
  { value: 'atardecer', label: 'Atardecer' },
  { value: 'bosque', label: 'Bosque' },
]

const KEY = `mesa:theme${sessionSuffix()}`
const SOUND_KEY = `mesa:sounds${sessionSuffix()}`
const ACCENT_KEY = `mesa:accent${sessionSuffix()}`
const BACKDROP_KEY = `mesa:backdrop${sessionSuffix()}`

const isAccent = (v: string | null): v is Accent => ACCENTS.some((a) => a.value === v)
const isBackdrop = (v: string | null): v is Backdrop => BACKDROPS.some((b) => b.value === v)

function readAccent(): Accent {
  try {
    const v = localStorage.getItem(ACCENT_KEY)
    if (isAccent(v)) return v
  } catch {
    /* storage unavailable */
  }
  return 'salvia'
}

function readBackdrop(): Backdrop {
  try {
    const v = localStorage.getItem(BACKDROP_KEY)
    if (isBackdrop(v)) return v
  } catch {
    /* storage unavailable */
  }
  return 'campo'
}

/** Paints the chosen accent and backdrop: the stylesheet reads them off the root element. Defaults leave no mark. */
export function applyLook(accent: Accent, backdrop: Backdrop): void {
  const root = document.documentElement
  if (accent === 'salvia') delete root.dataset.accent
  else root.dataset.accent = accent
  if (backdrop === 'campo') delete root.dataset.backdrop
  else root.dataset.backdrop = backdrop
}

function readSounds(): boolean {
  try {
    return localStorage.getItem(SOUND_KEY) !== 'off'
  } catch {
    return true
  }
}

function readTheme(): Theme {
  try {
    const v = localStorage.getItem(KEY)
    if (v === 'light' || v === 'dark' || v === 'system') return v
  } catch {
    /* storage unavailable */
  }
  // Night is the default: the interface recedes and the content carries the light.
  return 'dark'
}

export function applyTheme(theme: Theme): void {
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  const dark = theme === 'dark' || (theme === 'system' && prefersDark)
  document.documentElement.classList.toggle('dark', dark)
  // The colour that is actually on screen, not the preference. With «Sistema» the setting stays 'system' while
  // the palette flips underneath, and whatever paints itself from that palette — diagrams, HTML blocks — was
  // left with dark text on a dark background until it was edited or its window reopened.
  useSettings.setState({ dark })
  const { accent, backdrop } = useSettings.getState()
  applyLook(accent, backdrop)
}

const isDark = (theme: Theme): boolean => theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)

/** Writes a theme for an account that is not signed in yet (onboarding). */
export function persistThemeFor(userId: string, theme: Theme): void {
  try {
    localStorage.setItem(`mesa:theme:${userId}`, theme)
  } catch {
    /* ignore */
  }
}

interface SettingsState {
  theme: Theme
  /** Whether the palette on screen is the dark one, whatever the preference says. */
  dark: boolean
  setTheme: (theme: Theme) => void
  cycleTheme: () => void
  /** Earcons: the soft sounds of windows, tasks and the bar. */
  sounds: boolean
  setSounds: (on: boolean) => void
  accent: Accent
  setAccent: (accent: Accent) => void
  backdrop: Backdrop
  setBackdrop: (backdrop: Backdrop) => void
}

export const useSettings = create<SettingsState>((set, get) => ({
  theme: readTheme(),
  dark: isDark(readTheme()),
  setTheme: (theme) => {
    try {
      localStorage.setItem(KEY, theme)
    } catch {
      /* ignore */
    }
    applyTheme(theme)
    set({ theme })
  },
  cycleTheme: () => {
    const order: Theme[] = ['system', 'light', 'dark']
    const next = order[(order.indexOf(get().theme) + 1) % order.length]
    get().setTheme(next)
  },
  sounds: readSounds(),
  setSounds: (sounds) => {
    try {
      localStorage.setItem(SOUND_KEY, sounds ? 'on' : 'off')
    } catch {
      /* ignore */
    }
    set({ sounds })
  },
  accent: readAccent(),
  setAccent: (accent) => {
    try {
      localStorage.setItem(ACCENT_KEY, accent)
    } catch {
      /* ignore */
    }
    set({ accent })
    applyLook(accent, get().backdrop)
  },
  backdrop: readBackdrop(),
  setBackdrop: (backdrop) => {
    try {
      localStorage.setItem(BACKDROP_KEY, backdrop)
    } catch {
      /* ignore */
    }
    set({ backdrop })
    applyLook(get().accent, backdrop)
  },
}))
