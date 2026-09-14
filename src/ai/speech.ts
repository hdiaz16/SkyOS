import { useAiSettings } from './settings'

/**
 * Sky's voice. Two engines, one behaviour:
 * - With an OpenAI key stored, a neural Spanish voice (gpt-4o-mini-tts, "nova": warm, female).
 * - Otherwise the browser's own synthesis, choosing the most natural female Spanish voice it has.
 * Groq is not an option here: its speech models only speak English and Arabic.
 * Speaking without a user gesture can be refused by the browser, so callers treat false as
 * "offer a button to listen instead".
 */

export function speechAvailable(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined'
}

/** Female Spanish voices worth preferring, most natural first. Names as the OS/Chrome expose them. */
const FEMALE = [/dalia/i, /sabina/i, /paulina/i, /google español/i, /elvira/i, /helena/i, /laura/i, /lucia|lucía/i, /camila/i, /ximena/i, /elena/i, /mónica|monica/i, /isabela|isabella/i, /female|mujer/i]
const MALE = [/raul|raúl/i, /jorge/i, /pablo/i, /alvaro|álvaro/i, /diego/i, /andres|andrés/i, /juan/i, /carlos/i, /male|hombre/i]
const REGION = [/es-MX/i, /es-419/i, /es-US/i, /es-ES/i, /^es/i]

function voices(): Promise<SpeechSynthesisVoice[]> {
  const list = speechSynthesis.getVoices()
  if (list.length) return Promise.resolve(list)
  return new Promise((resolve) => {
    const done = () => resolve(speechSynthesis.getVoices())
    speechSynthesis.addEventListener('voiceschanged', done, { once: true })
    window.setTimeout(done, 1200)
  })
}

function score(v: SpeechSynthesisVoice): number {
  let s = 0
  if (MALE.some((re) => re.test(v.name))) s -= 100
  const fem = FEMALE.findIndex((re) => re.test(v.name))
  if (fem >= 0) s += 60 - fem * 3
  if (/natural|neural|online|premium|enhanced/i.test(v.name)) s += 25
  const region = REGION.findIndex((re) => re.test(v.lang))
  if (region >= 0) s += 10 - region * 2
  return s
}

export async function pickSpanishVoice(): Promise<SpeechSynthesisVoice | null> {
  const spanish = (await voices()).filter((v) => /^es/i.test(v.lang))
  if (!spanish.length) return null
  return [...spanish].sort((a, b) => score(b) - score(a))[0]
}

let utterance: SpeechSynthesisUtterance | null = null
let audio: HTMLAudioElement | null = null

function speakWithBrowser(text: string): Promise<boolean> {
  return pickSpanishVoice().then(
    (voice) =>
      new Promise<boolean>((resolve) => {
        if (!voice) return resolve(false)
        speechSynthesis.cancel()
        const u = new SpeechSynthesisUtterance(text)
        u.voice = voice
        u.lang = voice.lang
        u.rate = 1
        u.pitch = 1.04
        u.onend = () => {
          utterance = null
          resolve(true)
        }
        u.onerror = () => {
          utterance = null
          resolve(false)
        }
        utterance = u
        speechSynthesis.speak(u)
        // Some engines never fire events when speech is blocked; do not hang the caller.
        window.setTimeout(() => {
          if (utterance === u && !speechSynthesis.speaking) resolve(false)
        }, 1500)
      }),
  )
}

async function speakWithOpenAI(text: string, apiKey: string): Promise<boolean> {
  const res = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'gpt-4o-mini-tts', voice: 'nova', input: text.slice(0, 4000), response_format: 'mp3', speed: 1 }),
  })
  if (!res.ok) return false
  const url = URL.createObjectURL(await res.blob())
  return new Promise((resolve) => {
    stopSpeaking()
    const a = new Audio(url)
    audio = a
    const finish = (ok: boolean) => {
      URL.revokeObjectURL(url)
      if (audio === a) audio = null
      resolve(ok)
    }
    a.onended = () => finish(true)
    a.onerror = () => finish(false)
    a.play().catch(() => finish(false))
  })
}

/** Speaks the text. Resolves true when it finished, false when nothing could speak or the browser refused. */
export async function speak(text: string): Promise<boolean> {
  const clean = text.replace(/[*_#`>]/g, '').trim()
  if (!clean) return false
  const openaiKey = useAiSettings.getState().keys.openai
  if (openaiKey) {
    try {
      if (await speakWithOpenAI(clean, openaiKey)) return true
    } catch {
      /* fall back to the browser voice */
    }
  }
  if (!speechAvailable()) return false
  return speakWithBrowser(clean)
}

export function stopSpeaking(): void {
  if (audio) {
    audio.pause()
    audio = null
  }
  if (speechAvailable()) speechSynthesis.cancel()
  utterance = null
}

export function isSpeaking(): boolean {
  return !!audio || (speechAvailable() && speechSynthesis.speaking)
}
