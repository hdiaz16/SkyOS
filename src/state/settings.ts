import { create } from 'zustand'

export type Theme = 'system' | 'light' | 'dark'

const KEY = 'mesa:theme'

function readTheme(): Theme {
  try {
    const v = localStorage.getItem(KEY)
    if (v === 'light' || v === 'dark' || v === 'system') return v
  } catch {
    /* storage unavailable */
  }
  return 'system'
}

export function applyTheme(theme: Theme): void {
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  const dark = theme === 'dark' || (theme === 'system' && prefersDark)
  document.documentElement.classList.toggle('dark', dark)
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
