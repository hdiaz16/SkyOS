import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { useAuth } from '../../system/auth'
import { readSession, takeHandoff } from '../../system/session'
import { applyTheme, useSettings } from '../../state/settings'
import App from '../../App'
import { Backdrop } from '../Backdrop'
import { Login } from './Login'
import { SessionEnded } from './SessionEnded'
import { Onboarding } from './Onboarding'
import { OrbStage } from './OrbStage'
import { BELOW_ORB, useOrbStage } from './orbStore'

/**
 * A reload right after signing in or finishing the onboarding is a hand-over, not a boot: the previous
 * page already told its story, so this one skips the splash and lets the desktop in from where it left off.
 * Read once at module load so StrictMode's double effects cannot consume it twice.
 */
const handoff = takeHandoff()

/** Cold start lets the arrival play out; a signed-in reload gets a shorter one. */
const SPLASH_MS = readSession() ? 1700 : 2800

type Phase = 'splash' | 'content'

/**
 * Decides what is on screen: the splash, the login, the onboarding, or someone's desktop.
 * The orb is one persistent element (OrbStage); screens only swap the text under it.
 */
export function Shell() {
  const status = useAuth((s) => s.status)
  const stale = useAuth((s) => s.stale)
  const theme = useSettings((s) => s.theme)
  const [phase, setPhase] = useState<Phase>(handoff ? 'content' : 'splash')
  const [minElapsed, setMinElapsed] = useState(handoff !== null)

  // Before anyone is signed in there are no preferences yet, so the shell always greets in daylight.
  useEffect(() => {
    applyTheme(status === 'ready' ? theme : 'light')
  }, [status, theme])

  useEffect(() => {
    void useAuth.getState().load()
    if (handoff) return
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

  // index.html kept the page in the disc's color after the flood; once we know where we are going, the
  // veil below takes over and the document returns to its own ground.
  useEffect(() => {
    if (status !== 'loading') document.documentElement.classList.remove('handoff-flood')
  }, [status])

  // Unmounting the desktop is what actually stops the work: every subscription, saver and worker it started
  // is torn down by its own cleanup, so nothing of this person's keeps running under somebody else's session.
  const desktop = phase === 'content' && status === 'ready' && !stale
  const screen = phase === 'splash' ? 'splash' : status
  const flooded = handoff === 'flood' && status === 'loading'

  return (
    <div className="relative h-full w-full overflow-hidden">
      {stale ? (
        <SessionEnded reason={stale} />
      ) : desktop ? (
        <motion.div
          initial={handoff === 'flood' ? { opacity: 1, scale: 1.03 } : { opacity: 0, scale: 1.015 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1.1, ease: [0.2, 0.7, 0.2, 1] }}
          className="absolute inset-0"
        >
          <App />
        </motion.div>
      ) : (
        <>
          <Backdrop />
          <AnimatePresence mode="wait">
            {screen !== 'loading' && (
              <motion.div
                key={screen}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: { duration: 0.45, ease: 'easeInOut' } }}
                transition={{ duration: 0.7, ease: 'easeOut' }}
                className="absolute inset-0"
              >
                {screen === 'splash' ? <SplashText /> : screen === 'login' ? <Login /> : <Onboarding />}
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}

      <AnimatePresence>
        {!desktop && handoff !== 'flood' && (
          <motion.div key="orb" exit={{ opacity: 0, transition: { duration: 0.8 } }} className="pointer-events-none absolute inset-0">
            <OrbStage arrive={handoff === null} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* The flood's color, carried across the reload; it dissolves to reveal the desktop already in place. */}
      <AnimatePresence>
        {flooded && <motion.div key="veil" exit={{ opacity: 0, transition: { duration: 1.2, ease: 'easeInOut' } }} className="flood-veil pointer-events-none absolute inset-0 z-[20]" />}
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
