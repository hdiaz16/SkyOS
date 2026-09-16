import { create } from 'zustand'
import { sessionSuffix } from '../system/session'

export type Theme = 'system' | 'light' | 'dark'

const KEY = `mesa:theme${sessionSuffix()}`
const SOUND_KEY = `mesa:sounds${sessionSuffix()}`

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
}))
