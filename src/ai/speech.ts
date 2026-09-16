import { useAiSettings } from './settings'

/**
 * Sky's voice, best first:
 * - With a Gemini key stored, a model made for speech that takes direction: it is told how to say the line,
 *   not only what to say, which is the difference between reading and talking.
 * - With an OpenAI key, gpt-4o-mini-tts and the "nova" voice.
 * - Otherwise the browser's own synthesis, which is free and always there, choosing the most modern Spanish
 *   voice the machine has and cutting the text into sentences so it breathes.
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
/** How the promise of whatever is playing ends when someone silences it: pause fires neither ended nor error. */
let terminarAudio: (() => void) | null = null
/**
 * A voice made by a model takes seconds to arrive, and during those seconds there is nothing to pause: the
 * silence button had nothing to act on and the words came out anyway. Every attempt carries this token; asking
 * for silence bumps it, which both aborts the request in flight and tells whatever comes back that nobody is
 * listening any more.
 */
let turno = 0
let enVuelo: AbortController | null = null

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

/**
 * How Sky sounds, said in words because this model is directed rather than configured. Kept short: the longer
 * the direction, the more the model performs it instead of simply speaking.
 */
const DIRECCION = 'Dilo con calidez y cercanía, sin prisa, como quien habla de cerca y no como quien narra o locuta.'

/** A warm, unhurried voice among the ones the model offers. */
const VOZ_GEMINI = 'Aoede'
const MODELO_GEMINI = 'gemini-2.5-flash-preview-tts'

/** The model answers with raw samples; a player needs the little header that says what they are. */
function wavDesdePcm(pcm: Uint8Array<ArrayBuffer>, rate: number): Blob {
  const header = new ArrayBuffer(44)
  const v = new DataView(header)
  const texto = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i))
  }
  texto(0, 'RIFF')
  v.setUint32(4, 36 + pcm.length, true)
  texto(8, 'WAVE')
  texto(12, 'fmt ')
  v.setUint32(16, 16, true)
  v.setUint16(20, 1, true)
  v.setUint16(22, 1, true)
  v.setUint32(24, rate, true)
  v.setUint32(28, rate * 2, true)
  v.setUint16(32, 2, true)
  v.setUint16(34, 16, true)
  texto(36, 'data')
  v.setUint32(40, pcm.length, true)
  return new Blob([header, pcm], { type: 'audio/wav' })
}

function reproducir(blob: Blob, vigente: () => boolean): Promise<boolean> {
  const url = URL.createObjectURL(blob)
  return new Promise((resolve) => {
    // Silence asked for while this was being made still counts: nothing starts playing afterwards.
    if (!vigente()) {
      URL.revokeObjectURL(url)
      return resolve(false)
    }
    const a = new Audio(url)
    audio = a
    const acabar = (ok: boolean) => {
      URL.revokeObjectURL(url)
      if (audio === a) audio = null
      if (terminarAudio === fin) terminarAudio = null
      resolve(ok)
    }
    // Pausing an audio fires neither ended nor error, so the speak() of the previous turn never settled: its
    // button sat on «Silenciar» for ever without a sound, and pressing it cut off the one actually playing.
    const fin = () => acabar(false)
    terminarAudio = fin
    a.onended = () => acabar(true)
    a.onerror = () => acabar(false)
    a.play().catch(() => acabar(false))
  })
}

async function speakWithGemini(text: string, apiKey: string, signal: AbortSignal): Promise<boolean> {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODELO_GEMINI}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `${DIRECCION}\n\n${text.slice(0, 4000)}` }] }],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOZ_GEMINI } } },
      },
    }),
  })
  if (!res.ok) return false
  const data = (await res.json()) as { candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { data?: string; mimeType?: string } }> } }> }
  const parte = data.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData
  if (!parte?.data) return false
  const bytes = atob(parte.data)
  const pcm = new Uint8Array(new ArrayBuffer(bytes.length))
  for (let i = 0; i < bytes.length; i++) pcm[i] = bytes.charCodeAt(i)
  const rate = Number(/rate=(\d+)/.exec(parte.mimeType ?? '')?.[1] ?? 24000)
  return reproducir(wavDesdePcm(pcm, rate), () => !signal.aborted)
}

async function speakWithOpenAI(text: string, apiKey: string, signal: AbortSignal): Promise<boolean> {
  const res = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    signal,
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'gpt-4o-mini-tts', voice: 'nova', input: text.slice(0, 4000), response_format: 'mp3', speed: 1 }),
  })
  if (!res.ok) return false
  return reproducir(await res.blob(), () => !signal.aborted)
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
  stopSpeaking()
  const mio = ++turno
  const controller = new AbortController()
  enVuelo = controller
  const vigente = () => mio === turno
  const { keys } = useAiSettings.getState()
  // Best available wins, and every one of them falls through to the next without saying a word about it.
  if (keys.gemini) {
    try {
      if (await speakWithGemini(clean, keys.gemini, controller.signal)) return true
    } catch {
      /* siguiente */
    }
    if (!vigente()) return false
  }
  if (keys.openai) {
    try {
      if (await speakWithOpenAI(clean, keys.openai, controller.signal)) return true
    } catch {
      /* siguiente */
    }
    if (!vigente()) return false
  }
  if (!speechAvailable()) return false
  return speakWithBrowser(clean)
}

export function stopSpeaking(): void {
  turno++
  enVuelo?.abort()
  enVuelo = null
  if (audio) {
    audio.pause()
    audio = null
  }
  terminarAudio?.()
  terminarAudio = null
  if (speechAvailable()) speechSynthesis.cancel()
}

export function isSpeaking(): boolean {
  return !!audio || (speechAvailable() && speechSynthesis.speaking)
}
