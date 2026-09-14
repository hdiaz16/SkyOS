import { useEffect, useRef } from 'react'
import { cn } from '../../lib/utils'

interface Props {
  size?: number
  /** Quicker motion while Sky is working (shorthand for a higher tempo). */
  active?: boolean
  /** How fast the lit segment travels, in percent of the loop per second. Overrides `active`. */
  tempo?: number
  /** Play the arrival: the disc settles in from closer, the line draws itself, the halo blooms. */
  enter?: boolean
  /** The disc is opening into the screen: the line and the halo dissolve so only the color floods. */
  expanding?: boolean
  className?: string
}

const SAMPLES = 240
const W = 200
const H = 72

export const TEMPO_CALM = 14
export const TEMPO_BUSY = 45
export const TEMPO_RUSH = 520

/** A single continuous line that loops three times: x = cos t, y = sin 3t. Computed once. */
function glyphPath(): string {
  const parts: string[] = []
  for (let i = 0; i <= SAMPLES; i++) {
    const t = (i / SAMPLES) * Math.PI * 2
    const x = W / 2 + (W / 2 - 6) * Math.cos(t)
    const y = H / 2 + (H / 2 - 8) * Math.sin(3 * t)
    parts.push(`${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`)
  }
  return `${parts.join(' ')} Z`
}

const GLYPH = glyphPath()

/**
 * Sky's presence, in the spirit of OS1: a flat disc in the palette's green, a thin looping line in cream,
 * and a soft halo. A brighter segment travels along the line; its speed eases toward the requested tempo,
 * so "faster and faster" is a real acceleration rather than a jump.
 */
export function Orb({ size = 160, active = false, tempo, enter = false, expanding = false, className }: Props) {
  const traceRef = useRef<SVGPathElement>(null)
  const target = tempo ?? (active ? TEMPO_BUSY : TEMPO_CALM)
  const targetRef = useRef(target)

  useEffect(() => {
    targetRef.current = target
  }, [target])

  useEffect(() => {
    const path = traceRef.current
    if (!path) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let speed = targetRef.current
    let offset = 0
    let last = performance.now()
    let frame = 0
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      speed += (targetRef.current - speed) * Math.min(1, dt * 2.4)
      offset = (offset - speed * dt) % 100
      path.style.strokeDashoffset = `${offset}`
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])

  return (
    <div
      className={cn('orb', enter && 'orb-enter', expanding && 'orb-expanding', className)}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <div className="orb-halo" />
      <div className="orb-disc">
        <svg viewBox={`0 0 ${W} ${H}`} className="orb-glyph" style={{ width: size * 0.64 }}>
          <path
            d={GLYPH}
            pathLength={100}
            fill="none"
            stroke="var(--orb-line)"
            strokeOpacity={0.45}
            strokeWidth={2.6}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="orb-base"
          />
          <path
            ref={traceRef}
            d={GLYPH}
            pathLength={100}
            fill="none"
            stroke="var(--orb-line)"
            strokeWidth={2.6}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="28 72"
            className="orb-trace"
          />
        </svg>
      </div>
    </div>
  )
}
