import { useAiSettings, type AiSettingsState } from './settings'
import { AiError } from './types'

/**
 * Dictation through Groq's Whisper endpoint. Works whenever a Groq key is stored, whichever provider
 * answers the conversation, because the transcript is just text dropped into the command bar.
 */

const TRANSCRIBE_URL = 'https://api.groq.com/openai/v1/audio/transcriptions'
const MODEL = 'whisper-large-v3-turbo'
const MAX_SECONDS = 60

export function dictationAvailable(state: AiSettingsState = useAiSettings.getState()): boolean {
  return !!state.keys.groq && typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia
}

export async function transcribe(audio: Blob, apiKey: string): Promise<string> {
  const form = new FormData()
  form.append('file', audio, `dictado.${audio.type.includes('mp4') ? 'mp4' : 'webm'}`)
  form.append('model', MODEL)
  form.append('language', 'es')
  form.append('response_format', 'json')
  form.append('temperature', '0')
  const res = await fetch(TRANSCRIBE_URL, { method: 'POST', headers: { Authorization: `Bearer ${apiKey}` }, body: form })
  if (!res.ok) {
    if (res.status === 401) throw new AiError('La llave de Groq no es válida.')
    if (res.status === 429) throw new AiError('Groq está saturado; intenta en unos segundos.', true)
    throw new AiError(`No se pudo transcribir (${res.status}).`, res.status >= 500)
  }
  const data = (await res.json()) as { text?: string }
  return (data.text ?? '').trim()
}

function pickMime(): string | undefined {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
  return candidates.find((m) => MediaRecorder.isTypeSupported(m))
}

/** One recording: start on demand, stop to get the audio, cleanly releasing the microphone. */
export class Recorder {
  private recorder: MediaRecorder | null = null
  private chunks: Blob[] = []
  private stream: MediaStream | null = null
  private timer: number | undefined

  async start(onAutoStop?: () => void): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const mimeType = pickMime()
    this.recorder = new MediaRecorder(this.stream, mimeType ? { mimeType } : undefined)
    this.chunks = []
    this.recorder.addEventListener('dataavailable', (e) => {
      if (e.data.size) this.chunks.push(e.data)
    })
    this.recorder.start(250)
    this.timer = window.setTimeout(() => onAutoStop?.(), MAX_SECONDS * 1000)
  }

  stop(): Promise<Blob> {
    return new Promise((resolve) => {
      window.clearTimeout(this.timer)
      const rec = this.recorder
      if (!rec || rec.state === 'inactive') {
        this.release()
        resolve(new Blob(this.chunks, { type: this.chunks[0]?.type || 'audio/webm' }))
        return
      }
      rec.addEventListener(
        'stop',
        () => {
          const blob = new Blob(this.chunks, { type: rec.mimeType || 'audio/webm' })
          this.release()
          resolve(blob)
        },
        { once: true },
      )
      rec.stop()
    })
  }

  cancel(): void {
    window.clearTimeout(this.timer)
    if (this.recorder && this.recorder.state !== 'inactive') this.recorder.stop()
    this.release()
  }

  private release(): void {
    this.stream?.getTracks().forEach((t) => t.stop())
    this.stream = null
    this.recorder = null
  }
}
