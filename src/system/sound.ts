import { useSettings } from '../state/settings'

/**
 * Earcons: tiny synthesized sounds for moments that deserve one (a window opening, a task finishing in the
 * background, the bar taking the keyboard). Nothing is loaded; everything is a few oscillators through a soft
 * gain, and the whole thing stays off when the person says so in Ajustes › Apariencia.
 */

export type Earcon = 'open' | 'close' | 'done' | 'tap' | 'error' | 'snap'

const MASTER_GAIN = 0.11

let ctx: AudioContext | null = null
let master: GainNode | null = null
let noise: AudioBuffer | null = null

function graph(): { ctx: AudioContext; master: GainNode } | null {
  if (!useSettings.getState().sounds) return null
  if (typeof AudioContext === 'undefined') return null
  if (!ctx) {
    ctx = new AudioContext()
    master = ctx.createGain()
    master.gain.value = MASTER_GAIN
    master.connect(ctx.destination)
  }
  if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined)
  return master ? { ctx, master } : null
}

function noiseBuffer(c: AudioContext): AudioBuffer {
  if (noise) return noise
  const length = Math.floor(c.sampleRate * 0.25)
  noise = c.createBuffer(1, length, c.sampleRate)
  const data = noise.getChannelData(0)
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1
  return noise
}

/** One note: a short glide with a fast attack and a soft tail. */
function tone(c: AudioContext, out: AudioNode, opts: { type: OscillatorType; from: number; to?: number; at: number; length: number; peak: number }) {
  const osc = c.createOscillator()
  const gain = c.createGain()
  osc.type = opts.type
  osc.frequency.setValueAtTime(opts.from, opts.at)
  if (opts.to) osc.frequency.exponentialRampToValueAtTime(opts.to, opts.at + opts.length)
  gain.gain.setValueAtTime(0.0001, opts.at)
  gain.gain.exponentialRampToValueAtTime(opts.peak, opts.at + 0.006)
  gain.gain.exponentialRampToValueAtTime(0.0001, opts.at + opts.length)
  osc.connect(gain)
  gain.connect(out)
  osc.start(opts.at)
  osc.stop(opts.at + opts.length + 0.02)
}

/** A whisper of filtered noise: the click of glass. */
function tick(c: AudioContext, out: AudioNode, at: number, length: number, frequency: number, peak: number) {
  const src = c.createBufferSource()
  src.buffer = noiseBuffer(c)
  const filter = c.createBiquadFilter()
  filter.type = 'bandpass'
  filter.frequency.value = frequency
  filter.Q.value = 1.6
  const gain = c.createGain()
  gain.gain.setValueAtTime(peak, at)
  gain.gain.exponentialRampToValueAtTime(0.0001, at + length)
  src.connect(filter)
  filter.connect(gain)
  gain.connect(out)
  src.start(at)
  src.stop(at + length + 0.02)
}

/** Plays an earcon if sounds are on. Safe to call anywhere; silently does nothing without audio. */
export function play(name: Earcon): void {
  const g = graph()
  if (!g) return
  const { ctx: c, master: out } = g
  const t = c.currentTime + 0.005
  switch (name) {
    case 'open':
      tick(c, out, t, 0.05, 2400, 0.35)
      tone(c, out, { type: 'sine', from: 520, to: 780, at: t, length: 0.11, peak: 0.5 })
      break
    case 'close':
      tone(c, out, { type: 'sine', from: 640, to: 400, at: t, length: 0.1, peak: 0.4 })
      break
    case 'tap':
      tick(c, out, t, 0.03, 2800, 0.45)
      break
    case 'snap':
      tick(c, out, t, 0.035, 1800, 0.4)
      tone(c, out, { type: 'sine', from: 880, at: t + 0.01, length: 0.05, peak: 0.25 })
      break
    case 'done':
      tone(c, out, { type: 'triangle', from: 660, at: t, length: 0.12, peak: 0.45 })
      tone(c, out, { type: 'triangle', from: 990, at: t + 0.1, length: 0.16, peak: 0.4 })
      break
    case 'error':
      tone(c, out, { type: 'triangle', from: 240, to: 190, at: t, length: 0.16, peak: 0.45 })
      break
  }
}

/** Browsers unlock audio on the first gesture; this makes sure the context is awake by then. */
export function armAudio(): () => void {
  const wake = () => {
    if (useSettings.getState().sounds) graph()
  }
  window.addEventListener('pointerdown', wake, { once: true, capture: true })
  return () => window.removeEventListener('pointerdown', wake, true)
}
