import { create } from 'zustand'
import { sessionSuffix } from './session'

/**
 * Focus audio, synthesized on the spot: rain, wind, white and brown noise. No files, no network, one
 * AudioContext that starts on the person's click (browsers ask for that) and fades in and out gently.
 */

export type Ambient = 'off' | 'rain' | 'wind' | 'white' | 'brown'

export const AMBIENTS: { id: Exclude<Ambient, 'off'>; label: string; hint: string }[] = [
  { id: 'rain', label: 'Lluvia', hint: 'Gotas sobre un techo, lejos.' },
  { id: 'wind', label: 'Viento', hint: 'Aire entre árboles.' },
  { id: 'brown', label: 'Ruido café', hint: 'Grave y constante, tapa el ruido de fondo.' },
  { id: 'white', label: 'Ruido blanco', hint: 'Plano y neutro.' },
]

interface AmbientState {
  kind: Ambient
  volume: number
  set: (kind: Ambient) => void
  setVolume: (volume: number) => void
}

const KEY = () => `mesa:ambient${sessionSuffix()}`
const FADE_S = 0.8

function read(): Pick<AmbientState, 'kind' | 'volume'> {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY()) ?? '{}') as Partial<Pick<AmbientState, 'kind' | 'volume'>>
    // Audio never starts on its own after a reload; only the volume and the last choice come back.
    return { kind: 'off', volume: typeof raw.volume === 'number' ? raw.volume : 0.35 }
  } catch {
    return { kind: 'off', volume: 0.35 }
  }
}

function persist(state: Pick<AmbientState, 'kind' | 'volume'>): void {
  try {
    localStorage.setItem(KEY(), JSON.stringify(state))
  } catch {
    // preference lasts the session
  }
}

export const useAmbient = create<AmbientState>((set, get) => ({
  ...read(),
  set: (kind) => {
    set({ kind })
    persist({ kind, volume: get().volume })
    engine.play(kind, get().volume)
  },
  setVolume: (volume) => {
    const v = Math.min(1, Math.max(0, volume))
    set({ volume: v })
    persist({ kind: get().kind, volume: v })
    engine.setVolume(v)
  },
}))

/* ---------- synthesis ---------- */

interface Voice {
  nodes: AudioNode[]
  stop: () => void
}

let ctx: AudioContext | null = null
let master: GainNode | null = null
let current: Voice | null = null

function context(): { ctx: AudioContext; master: GainNode } {
  if (!ctx) {
    ctx = new AudioContext()
    master = ctx.createGain()
    master.gain.value = 0
    master.connect(ctx.destination)
  }
  if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined)
  return { ctx, master: master! }
}

/** Seconds of noise, looped. White is flat; brown integrates it into a deep rumble. */
function noiseBuffer(c: AudioContext, kind: 'white' | 'brown'): AudioBuffer {
  const length = c.sampleRate * 4
  const buffer = c.createBuffer(2, length, c.sampleRate)
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch)
    let last = 0
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1
      if (kind === 'white') {
        data[i] = white * 0.5
      } else {
        last = (last + 0.02 * white) / 1.02
        data[i] = last * 3.5
      }
    }
  }
  return buffer
}

function loop(c: AudioContext, kind: 'white' | 'brown'): AudioBufferSourceNode {
  const src = c.createBufferSource()
  src.buffer = noiseBuffer(c, kind)
  src.loop = true
  src.start()
  return src
}

function makeVoice(c: AudioContext, out: AudioNode, kind: Exclude<Ambient, 'off'>): Voice {
  const nodes: AudioNode[] = []
  const timers: number[] = []
  const connect = (chain: AudioNode[]) => {
    for (let i = 0; i < chain.length - 1; i++) chain[i].connect(chain[i + 1])
    chain[chain.length - 1].connect(out)
    nodes.push(...chain)
  }

  if (kind === 'white') {
    connect([loop(c, 'white')])
  } else if (kind === 'brown') {
    connect([loop(c, 'brown')])
  } else if (kind === 'wind') {
    const src = loop(c, 'brown')
    const filter = c.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 500
    filter.Q.value = 0.8
    const lfo = c.createOscillator()
    lfo.frequency.value = 0.09
    const depth = c.createGain()
    depth.gain.value = 320
    lfo.connect(depth)
    depth.connect(filter.frequency)
    lfo.start()
    nodes.push(lfo, depth)
    connect([src, filter])
  } else {
    // Rain: a hiss of filtered noise plus scattered drops.
    const hiss = loop(c, 'white')
    const band = c.createBiquadFilter()
    band.type = 'bandpass'
    band.frequency.value = 1800
    band.Q.value = 0.5
    const hissGain = c.createGain()
    hissGain.gain.value = 0.55
    connect([hiss, band, hissGain])
    const drops = c.createGain()
    drops.gain.value = 0.5
    drops.connect(out)
    nodes.push(drops)
    const drop = () => {
      const t = c.currentTime
      const osc = c.createOscillator()
      const g = c.createGain()
      osc.type = 'sine'
      osc.frequency.value = 1800 + Math.random() * 2600
      g.gain.setValueAtTime(0.0001, t)
      g.gain.exponentialRampToValueAtTime(0.12 + Math.random() * 0.1, t + 0.004)
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03 + Math.random() * 0.03)
      osc.connect(g)
      g.connect(drops)
      osc.start(t)
      osc.stop(t + 0.08)
      timers.push(window.setTimeout(drop, 40 + Math.random() * 220))
    }
    drop()
  }

  return {
    nodes,
    stop: () => {
      for (const t of timers) window.clearTimeout(t)
      for (const n of nodes) {
        try {
          if ('stop' in n && typeof (n as AudioScheduledSourceNode).stop === 'function') (n as AudioScheduledSourceNode).stop()
        } catch {
          // already stopped
        }
        n.disconnect()
      }
    },
  }
}

const engine = {
  play(kind: Ambient, volume: number): void {
    if (kind === 'off') {
      engine.stop()
      return
    }
    const { ctx: c, master: out } = context()
    current?.stop()
    current = makeVoice(c, out, kind)
    out.gain.cancelScheduledValues(c.currentTime)
    out.gain.setValueAtTime(out.gain.value, c.currentTime)
    out.gain.linearRampToValueAtTime(volume, c.currentTime + FADE_S)
  },
  stop(): void {
    if (!ctx || !master || !current) return
    const voice = current
    current = null
    master.gain.cancelScheduledValues(ctx.currentTime)
    master.gain.setValueAtTime(master.gain.value, ctx.currentTime)
    master.gain.linearRampToValueAtTime(0, ctx.currentTime + FADE_S)
    window.setTimeout(() => voice.stop(), FADE_S * 1000 + 50)
  },
  setVolume(volume: number): void {
    if (!ctx || !master || !current) return
    master.gain.cancelScheduledValues(ctx.currentTime)
    master.gain.setValueAtTime(master.gain.value, ctx.currentTime)
    master.gain.linearRampToValueAtTime(volume, ctx.currentTime + 0.2)
  },
}
