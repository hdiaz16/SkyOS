/**
 * Build-time configuration. Values come from `.env.local` (ignored by git); see `.env.example`.
 *
 * A shared Groq key lets every new account start working immediately; each person can later paste their
 * own key or switch provider in Ajustes. Anything shipped to a browser can be read by whoever runs it, so
 * treat this key as a starter with limits, not a secret.
 */
const env = import.meta.env as Record<string, string | undefined>

export const DEFAULT_GROQ_KEY = env.VITE_GROQ_KEY?.trim() ?? ''

export const hasSharedGroqKey = DEFAULT_GROQ_KEY.startsWith('gsk_')
