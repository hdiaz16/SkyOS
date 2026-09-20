/**
 * The browser's Back — the mouse button, Alt+←, the gesture — used to take the person out of SkyOS, or reload
 * it, because a desktop is one page and the browser had nothing behind it to go back to. The page now keeps one
 * step of its own in the browser's history: Back lands on that step, the step is put back at once, and the press
 * is handed to whoever inside wants it — the Navegador going back a page — or simply ignored. Nothing leaves.
 */

/** Answers one press of Back. True means it was used; false lets the next one try. */
type BackHandler = () => boolean

const handlers: BackHandler[] = []

/** Registers who answers Back; the newest registered is asked first. Returns the way to unregister. */
export function onBack(handler: BackHandler): () => void {
  handlers.unshift(handler)
  return () => {
    const i = handlers.indexOf(handler)
    if (i >= 0) handlers.splice(i, 1)
  }
}

const OWN = 'sky-atras'

/** Puts the desktop's own step in the history and keeps it there. Called once, when the desktop boots. */
export function trapBack(): void {
  if (typeof window === 'undefined') return
  const arm = () => window.history.pushState({ [OWN]: true }, '', window.location.href)
  const state = window.history.state as Record<string, unknown> | null
  if (!state?.[OWN]) arm()
  window.addEventListener('popstate', () => {
    // Back landed on the entry underneath ours: ours goes back on top so the next press is caught as well.
    arm()
    for (const handler of handlers) if (handler()) return
  })
}
