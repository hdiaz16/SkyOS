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

/**
 * What separates a voice that sounds like a person from one that sounds like a machine reading is the engine
 * behind it. A neural voice — Google's, or the Microsoft ones marked "Online (Natural)" — belongs to another
 * era than the desktop synthesizers Windows has shipped for twenty years. Whether the name is female matters
 * much less than that, so it weighs much less.
 */
const NEURAL = /natural|neural|online|premium|enhanced|google/i
/** The old SAPI voices: they work, and they are the ones people call robotic. */
const LEGACY = /desktop/i

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
  if (fem >= 0) s += 40 - fem * 2
  if (NEURAL.test(v.name)) s += 90
  if (LEGACY.test(v.name)) s -= 45
  if (!v.localService) s += 15 // a voice that lives on a server is almost always the modern one
  const region = REGION.findIndex((re) => re.test(v.lang))
  if (region >= 0) s += 10 - region * 2
  return s
}

/**
 * Speech engines read a whole paragraph in one breath and it comes out flat. Cutting it into sentences gives
 * back the pause a person takes between one idea and the next, which is most of what makes a voice sound
 * alive. Very short fragments are glued to the one before, so it does not stutter.
 */
function sentences(text: string): string[] {
  const out: string[] = []
  for (const piece of text.split(/(?<=[.!?…])\s+|\n+/)) {
    const clean = piece.trim()
    if (!clean) continue
    if (out.length && clean.length < 18) out[out.length - 1] += ` ${clean}`
    else out.push(clean)
  }
  return out.length ? out : [text]
}

export async function pickSpanishVoice(): Promise<SpeechSynthesisVoice | null> {
  const spanish = (await voices()).filter((v) => /^es/i.test(v.lang))
  if (!spanish.length) return null
  return [...spanish].sort((a, b) => score(b) - score(a))[0]
}

let audio: HTMLAudioElement | null = null

function speakWithBrowser(text: string): Promise<boolean> {
  return pickSpanishVoice().then(
    (voice) =>
      new Promise<boolean>((resolve) => {
        if (!voice) return resolve(false)
        speechSynthesis.cancel()
        const parts = sentences(text)
        parts.forEach((part, i) => {
          const u = new SpeechSynthesisUtterance(part)
          u.voice = voice
          u.lang = voice.lang
          // A shade under the default: these engines rush, and rushing is what sounds mechanical. The pitch
          // stays where the voice was built to sit; nudging it up only makes it thinner.
          u.rate = 0.96
          u.pitch = 1
          if (i === parts.length - 1) {
            u.onend = () => {
              resolve(true)
            }
          }
          u.onerror = () => {
            resolve(false)
          }
          speechSynthesis.speak(u)
        })
        // Some engines never fire events when speech is blocked; do not hang the caller.
        window.setTimeout(() => {
          if (!speechSynthesis.speaking && !speechSynthesis.pending) resolve(false)
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
  // Nobody wants to hear a URL spelled out letter by letter, and markdown marks are for the eye.
  const clean = text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/https?:\/\/\S+/g, 'un enlace')
    .replace(/[*_#`>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
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
}

export function isSpeaking(): boolean {
  return !!audio || (speechAvailable() && speechSynthesis.speaking)
}
