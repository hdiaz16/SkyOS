import { create } from 'zustand'
import { sessionSuffix } from '../system/session'

/**
 * Sky's speaking setup: the ElevenLabs key, the voice and the model the person chose. It lives under the
 * session-scoped storage key, like every key in SkyOS: each account's settings are its own here, and no
 * other person on this machine ever reads them.
 */

interface VoiceSettings {
  elevenKey: string
  elevenVoiceId: string
  elevenModel: string
}

interface VoiceSettingsState extends VoiceSettings {
  setElevenKey: (key: string) => void
  setElevenVoice: (id: string) => void
  setElevenModel: (id: string) => void
}

const KEY = `mesa:voz${sessionSuffix()}`

const DEFAULTS: VoiceSettings = { elevenKey: '', elevenVoiceId: '', elevenModel: '' }

function load(): VoiceSettings {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return DEFAULTS
    return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<VoiceSettings>) }
  } catch {
    return DEFAULTS
  }
}

function persist(state: VoiceSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    /* storage unavailable */
  }
}

export const useVoiceSettings = create<VoiceSettingsState>((set, get) => ({
  ...load(),
  setElevenKey: (elevenKey) => {
    set({ elevenKey: elevenKey.trim() })
    persist(get())
  },
  setElevenVoice: (elevenVoiceId) => {
    set({ elevenVoiceId })
    persist(get())
  },
  setElevenModel: (elevenModel) => {
    set({ elevenModel })
    persist(get())
  },
}))
