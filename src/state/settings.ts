import { create } from 'zustand'
import { sessionSuffix } from '../system/session'

export type Theme = 'system' | 'light' | 'dark'

const KEY = `mesa:theme${sessionSuffix()}`

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
}

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
  setTheme: (theme: Theme) => void
  cycleTheme: () => void
}

export const useSettings = create<SettingsState>((set, get) => ({
  theme: readTheme(),
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
}))
