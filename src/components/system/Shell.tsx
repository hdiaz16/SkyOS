import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { useAuth } from '../../system/auth'
import { readSession } from '../../system/session'
import { applyTheme, useSettings } from '../../state/settings'
import App from '../../App'
import { Backdrop } from '../Backdrop'
import { Login } from './Login'
import { Onboarding } from './Onboarding'
import { Orb, TEMPO_BUSY, TEMPO_CALM } from './Orb'

/** Cold start lets the arrival play out; a signed-in reload gets a shorter one. */
const SPLASH_MS = readSession() ? 1700 : 2800

type Phase = 'splash' | 'content'

/**
 * Decides what is on screen: the splash, the login, the onboarding, or someone's desktop.
 * The splash only arrives (zoom in) and dissolves; the opening flood belongs to the end of the onboarding.
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

  useEffect(() => {
    if (phase !== 'splash' || !minElapsed || status === 'loading') return
    const f = requestAnimationFrame(() => setPhase('content'))
    return () => cancelAnimationFrame(f)
  }, [phase, minElapsed, status])

  return (
    <div className="relative h-full w-full overflow-hidden">
      {phase === 'content' && (
        <motion.div
          key={status}
          initial={{ opacity: 0, scale: 1.015 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1.1, ease: [0.2, 0.7, 0.2, 1] }}
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
        {phase === 'splash' && (
          <motion.div key="splash" exit={{ opacity: 0, transition: { duration: 0.9, ease: 'easeInOut' } }} className="absolute inset-0">
            <Backdrop />
            <Splash hurrying={!minElapsed || status === 'loading'} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/** Arrival: the disc settles in from closer and draws its line while the name sharpens out of a blur. */
function Splash({ hurrying }: { hurrying: boolean }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-9 select-none">
      <Orb size={132} enter tempo={hurrying ? TEMPO_BUSY : TEMPO_CALM} />
      <motion.p
        initial={{ opacity: 0, filter: 'blur(12px)', letterSpacing: '0.35em', y: 8 }}
        animate={{ opacity: 1, filter: 'blur(0px)', letterSpacing: '0.04em', y: 0 }}
        transition={{ delay: 1.1, duration: 1.1, ease: [0.2, 0.8, 0.2, 1] }}
        className="font-display text-[30px] font-bold text-ink"
      >
        Sky
      </motion.p>
    </div>
  )
}
