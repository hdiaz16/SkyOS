import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { useAuth } from '../../system/auth'
import { readSession } from '../../system/session'
import { applyTheme, useSettings } from '../../state/settings'
import App from '../../App'
import { Backdrop } from '../Backdrop'
import { Login } from './Login'
import { Onboarding } from './Onboarding'
import { OrbStage } from './OrbStage'
import { BELOW_ORB, useOrbStage } from './orbStore'

/** Cold start lets the arrival play out; a signed-in reload gets a shorter one. */
const SPLASH_MS = readSession() ? 1700 : 2800

type Phase = 'splash' | 'content'

/**
 * Decides what is on screen: the splash, the login, the onboarding, or someone's desktop.
 * The orb is one persistent element (OrbStage); screens only swap the text under it.
 */
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

  // While loading the line hurries; once the shell knows where to go, the text changes and the orb settles.
  useEffect(() => {
    if (phase !== 'splash') return
    useOrbStage.getState().setMode(!minElapsed || status === 'loading' ? 'busy' : 'idle')
    if (!minElapsed || status === 'loading') return
    const f = requestAnimationFrame(() => setPhase('content'))
    return () => cancelAnimationFrame(f)
  }, [phase, minElapsed, status])

  const desktop = phase === 'content' && status === 'ready'

  return (
    <div className="relative h-full w-full overflow-hidden">
      {desktop ? (
        <motion.div initial={{ opacity: 0, scale: 1.015 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 1.1, ease: [0.2, 0.7, 0.2, 1] }} className="absolute inset-0">
          <App />
        </motion.div>
      ) : (
        <>
          <Backdrop />
          <AnimatePresence mode="wait">
            <motion.div
              key={phase === 'splash' ? 'splash' : status}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.45, ease: 'easeInOut' } }}
              transition={{ duration: 0.7, ease: 'easeOut' }}
              className="absolute inset-0"
            >
              {phase === 'splash' ? <SplashText /> : status === 'login' ? <Login /> : <Onboarding />}
            </motion.div>
          </AnimatePresence>
        </>
      )}

      <AnimatePresence>
        {!desktop && (
          <motion.div key="orb" exit={{ opacity: 0, transition: { duration: 0.8 } }} className="pointer-events-none absolute inset-0">
            <OrbStage />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/** The name sharpens out of a blur under the orb while it arrives. */
function SplashText() {
  return (
    <div className="absolute inset-x-0 flex justify-center select-none" style={{ top: BELOW_ORB }}>
      <motion.p
        initial={{ opacity: 0, filter: 'blur(12px)', letterSpacing: '0.35em', y: 8 }}
        animate={{ opacity: 1, filter: 'blur(0px)', letterSpacing: '0.04em', y: 0 }}
        transition={{ delay: 1.1, duration: 1.1, ease: [0.2, 0.8, 0.2, 1] }}
        className="font-display text-[30px] font-bold text-ink"
      >
        SkyOS
      </motion.p>
    </div>
  )
}
