/**
 * Sky's voice: the browser's own speech synthesis, no network, no key. Prefers a Latin American Spanish
 * voice, then any Spanish one. Speaking without a user gesture can be refused by the browser, so callers
 * treat a false result as "show a button to listen instead".
 */

export function speechAvailable(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined'
}

const PREFERRED = [/es-MX/i, /es-419/i, /es-US/i, /es-ES/i, /^es/i]
const NICE_NAMES = [/dalia/i, /jorge/i, /sabina/i, /google español/i, /helena/i, /paulina/i, /mónica|monica/i]

function voices(): Promise<SpeechSynthesisVoice[]> {
  const list = speechSynthesis.getVoices()
  if (list.length) return Promise.resolve(list)
  return new Promise((resolve) => {
    const done = () => resolve(speechSynthesis.getVoices())
    speechSynthesis.addEventListener('voiceschanged', done, { once: true })
    window.setTimeout(done, 1200)
  })
}

export async function pickSpanishVoice(): Promise<SpeechSynthesisVoice | null> {
  const all = await voices()
  const spanish = all.filter((v) => /^es/i.test(v.lang))
  if (!spanish.length) return null
  const byName = spanish.find((v) => NICE_NAMES.some((re) => re.test(v.name)))
  if (byName) return byName
  for (const re of PREFERRED) {
    const v = spanish.find((x) => re.test(x.lang))
    if (v) return v
  }
  return spanish[0]
}

let current: SpeechSynthesisUtterance | null = null

/** Speaks the text. Resolves true when it finished, false when the browser refused or nothing could speak. */
export async function speak(text: string): Promise<boolean> {
  if (!speechAvailable() || !text.trim()) return false
  const voice = await pickSpanishVoice()
  if (!voice) return false
  speechSynthesis.cancel()
  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(text)
    u.voice = voice
    u.lang = voice.lang
    u.rate = 0.98
    u.pitch = 1
    u.onend = () => {
      current = null
      resolve(true)
    }
    u.onerror = () => {
      current = null
      resolve(false)
    }
    current = u
    speechSynthesis.speak(u)
    // Some engines never fire events when speech is blocked; do not hang the caller.
    window.setTimeout(() => {
      if (current === u && !speechSynthesis.speaking) resolve(false)
    }, 1500)
  })
}

export function stopSpeaking(): void {
  if (speechAvailable()) speechSynthesis.cancel()
  current = null
}
