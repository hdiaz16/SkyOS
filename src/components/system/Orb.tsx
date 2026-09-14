import { cn } from '../../lib/utils'

interface Props {
  size?: number
  /** Quicker motion while Sky is working. */
  active?: boolean
  /** Play the arrival: the disc grows from a point, the line draws itself, the halo blooms. */
  enter?: boolean
  /** The disc is opening into the screen: hide the line and the halo so only the color floods. */
  expanding?: boolean
  className?: string
}

const SAMPLES = 240
const W = 200
const H = 72

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
 * and a soft halo. A brighter segment travels along the line so it reads as alive, never as a 3D ball.
 */
export function Orb({ size = 160, active = false, enter = false, expanding = false, className }: Props) {
  return (
    <div
      className={cn('orb', active && 'orb-active', enter && 'orb-enter', expanding && 'orb-expanding', className)}
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
          <path d={GLYPH} pathLength={100} fill="none" stroke="var(--orb-line)" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" className="orb-trace" />
        </svg>
      </div>
    </div>
  )
}
