import { motion } from 'motion/react'
import { Orb, TEMPO_BUSY, TEMPO_CALM, TEMPO_RUSH } from './Orb'
import { ORB_SIZE, ORB_TOP, useOrbStage } from './orbStore'

/**
 * One orb for every pre-desktop screen. It is mounted once and stays put at a fixed anchor while the
 * splash, the onboarding and the login change the text beneath it; only its mood changes.
 */
export function OrbStage() {
  const mode = useOrbStage((s) => s.mode)
  const tempo = mode === 'rush' || mode === 'flood' ? TEMPO_RUSH : mode === 'busy' ? TEMPO_BUSY : TEMPO_CALM
  const flooding = mode === 'flood'
  return (
    <div className="pointer-events-none absolute inset-0 z-[10]">
      <motion.div
        className="absolute left-1/2"
        style={{ top: ORB_TOP, x: '-50%', y: '-50%', willChange: 'transform, opacity' }}
        animate={flooding ? { scale: 24, opacity: 1 } : { scale: 1, opacity: mode === 'hidden' ? 0 : 1 }}
        transition={flooding ? { duration: 1, ease: [0.7, 0, 0.3, 1] } : { duration: 0.7, ease: 'easeInOut' }}
      >
        <Orb size={ORB_SIZE} enter tempo={tempo} expanding={flooding} />
      </motion.div>
    </div>
  )
}
