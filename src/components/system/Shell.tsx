import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { useAuth } from '../../system/auth'
import { readSession } from '../../system/session'
import { applyTheme, useSettings } from '../../state/settings'
import App from '../../App'
import { Backdrop } from '../Backdrop'
import { Login } from './Login'
import { Onboarding } from './Onboarding'
import { Orb } from './Orb'

/** Cold start lets the arrival play out; a signed-in reload gets a shorter one. */
const SPLASH_MS = readSession() ? 1500 : 2600
const EXPAND_MS = 950

type Phase = 'splash' | 'expanding' | 'content'

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

  // The orb hurries while things load; once the shell knows where to go it opens up and hands over.
  useEffect(() => {
    if (phase !== 'splash' || !minElapsed || status === 'loading') return
    const expand = requestAnimationFrame(() => setPhase('expanding'))
    return () => cancelAnimationFrame(expand)
  }, [phase, minElapsed, status])

  // Separate from the step above: changing phase must not cancel the hand-over timer.
  useEffect(() => {
    if (phase !== 'expanding') return
    const handOver = window.setTimeout(() => setPhase('content'), EXPAND_MS)
    return () => window.clearTimeout(handOver)
  }, [phase])

  if (phase === 'content' && status === 'ready') {
    return (
      <motion.div initial={{ opacity: 0, scale: 1.02 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.7, ease: 'easeOut' }} className="h-full w-full">
        <App />
      </motion.div>
    )
  }

  return (
    <div className="relative h-full w-full overflow-hidden">
      <Backdrop />
      <AnimatePresence mode="wait">
        <motion.div
          key={phase === 'content' ? status : 'splash'}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.2 } }}
          transition={{ duration: 0.5 }}
          className="absolute inset-0"
        >
          {phase !== 'content' ? (
            <Splash expanding={phase === 'expanding'} hurrying={!minElapsed || status === 'loading'} />
          ) : status === 'login' ? (
            <Login />
          ) : (
            <Onboarding />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

/**
 * Arrival: the disc grows from a point and draws its line while the name sharpens out of a blur.
 * Departure: the disc opens until its color fills the screen, and the next scene fades in from it.
 */
function Splash({ expanding, hurrying }: { expanding: boolean; hurrying: boolean }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-9 select-none">
      <motion.div
        animate={expanding ? { scale: 22, opacity: [1, 1, 0] } : { scale: 1, opacity: 1 }}
        transition={expanding ? { duration: EXPAND_MS / 1000, times: [0, 0.7, 1], ease: [0.65, 0, 0.35, 1] } : { duration: 0 }}
        style={{ willChange: 'transform, opacity' }}
      >
        <Orb size={132} enter active={hurrying} expanding={expanding} />
      </motion.div>
      <motion.p
        initial={{ opacity: 0, filter: 'blur(12px)', letterSpacing: '0.35em', y: 8 }}
        animate={expanding ? { opacity: 0, filter: 'blur(6px)', y: -6 } : { opacity: 1, filter: 'blur(0px)', letterSpacing: '0.04em', y: 0 }}
        transition={expanding ? { duration: 0.3 } : { delay: 1.1, duration: 1.1, ease: [0.2, 0.8, 0.2, 1] }}
        className="font-display text-[30px] font-bold text-ink"
      >
        Sky
      </motion.p>
    </div>
  )
}
