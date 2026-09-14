import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { useAuth } from '../../system/auth'
import { readSession } from '../../system/session'
import { applyTheme, useSettings } from '../../state/settings'
import App from '../../App'
import { Backdrop } from '../Backdrop'
import { Login } from './Login'
import { Onboarding } from './Onboarding'
import { Orb, TEMPO_BUSY, TEMPO_CALM, TEMPO_RUSH } from './Orb'

/** Cold start lets the arrival play out; a signed-in reload gets a shorter one. */
const SPLASH_MS = readSession() ? 1600 : 2700
/** The line hurries more and more before the disc opens. */
const ACCEL_MS = 1300
/** The disc floods the screen while the next scene is already fading in underneath. */
const EXPAND_MS = 1000

type Phase = 'splash' | 'accelerating' | 'expanding' | 'content'

/** Decides what is on screen: the splash, the login, the onboarding, or someone's desktop. */
export function Shell() {
  const status = useAuth((s) => s.status)
  const theme = useSettings((s) => s.theme)
  const [phase, setPhase] = useState<Phase>('splash')
  const [minElapsed, setMinElapsed] = useState(false)

  // Before anyone is signed in there are no preferences yet, so the shell always greets in daylight.
  useEffect(() => {
    applyTheme(status === 'ready' ? theme : 'light')
  }, [status, theme])

  useEffect(() => {
    void useAuth.getState().load()
    const t = window.setTimeout(() => setMinElapsed(true), SPLASH_MS)
    return () => window.clearTimeout(t)
  }, [])

  // Each step owns its timer so a phase change never cancels the next hand-over.
  useEffect(() => {
    if (phase !== 'splash' || !minElapsed || status === 'loading') return
    const f = requestAnimationFrame(() => setPhase('accelerating'))
    return () => cancelAnimationFrame(f)
  }, [phase, minElapsed, status])

  useEffect(() => {
    if (phase !== 'accelerating') return
    const t = window.setTimeout(() => setPhase('expanding'), ACCEL_MS)
    return () => window.clearTimeout(t)
  }, [phase])

  useEffect(() => {
    if (phase !== 'expanding') return
    const t = window.setTimeout(() => setPhase('content'), EXPAND_MS)
    return () => window.clearTimeout(t)
  }, [phase])

  // The next scene mounts under the flood and fades in, so the desktop is already there when the green lifts.
  const showContent = status !== 'loading' && (phase === 'expanding' || phase === 'content')

  return (
    <div className="relative h-full w-full overflow-hidden">
      {showContent && (
        <motion.div
          key={status}
          initial={{ opacity: 0, scale: 1.02 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1.3, delay: 0.5, ease: [0.2, 0.7, 0.2, 1] }}
          className="absolute inset-0"
        >
          {status === 'ready' ? (
            <App />
          ) : (
            <>
              <Backdrop />
              {status === 'login' ? <Login /> : <Onboarding />}
            </>
          )}
        </motion.div>
      )}

      <AnimatePresence>
        {phase !== 'content' && (
          <motion.div key="splash" exit={{ opacity: 0, transition: { duration: 0.8, ease: 'easeInOut' } }} className="absolute inset-0">
            <Backdrop />
            <Splash phase={phase} hurrying={!minElapsed || status === 'loading'} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/**
 * Arrival: the disc settles in from closer and draws its line while the name sharpens out of a blur.
 * Departure: the line races, then dissolves as the disc opens until its color fills the screen.
 */
function Splash({ phase, hurrying }: { phase: Phase; hurrying: boolean }) {
  const expanding = phase === 'expanding'
  const tempo = phase === 'accelerating' || expanding ? TEMPO_RUSH : hurrying ? TEMPO_BUSY : TEMPO_CALM
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-9 select-none">
      <motion.div
        animate={expanding ? { scale: 24 } : { scale: 1 }}
        transition={expanding ? { duration: EXPAND_MS / 1000, ease: [0.7, 0, 0.3, 1] } : { duration: 0 }}
        style={{ willChange: 'transform' }}
      >
        <Orb size={132} enter tempo={tempo} expanding={expanding} />
      </motion.div>
      <motion.p
        initial={{ opacity: 0, filter: 'blur(12px)', letterSpacing: '0.35em', y: 8 }}
        animate={
          phase === 'splash'
            ? { opacity: 1, filter: 'blur(0px)', letterSpacing: '0.04em', y: 0 }
            : { opacity: 0, filter: 'blur(8px)', letterSpacing: '0.04em', y: -6 }
        }
        transition={phase === 'splash' ? { delay: 1.1, duration: 1.1, ease: [0.2, 0.8, 0.2, 1] } : { duration: 0.5 }}
        className="font-display text-[30px] font-bold text-ink"
      >
        Sky
      </motion.p>
    </div>
  )
}
