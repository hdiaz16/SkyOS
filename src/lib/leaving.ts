/**
 * One last chance to save before the page goes away.
 *
 * Closing the tab, reloading it, or the phone sending the browser to the background all skip React's cleanup:
 * a window that flushes its pending changes on unmount never hears about any of them, and whatever was inside
 * the debounce is gone. Anything holding unsaved work registers here.
 *
 * pagehide is the last event that fires in every browser, including iOS Safari, where unload never does.
 * visibilitychange comes earlier and with more room to breathe — switching apps, locking the screen — so the
 * work is usually already written by the time the tab actually dies. Neither can wait for a promise, so a flush
 * has to start its write and let go; IndexedDB usually finishes it, and this is a floor, not a guarantee.
 */
type Flush = () => void

const pending = new Set<Flush>()
let listening = false

function runAll(): void {
  for (const flush of pending) {
    try {
      flush()
    } catch {
      // One window failing to save is not a reason to skip the next one.
    }
  }
}

/** Registers a flush; returns the function that stops it being called. Flushes must be safe to run twice. */
export function onLeaving(flush: Flush): () => void {
  pending.add(flush)
  if (!listening) {
    listening = true
    window.addEventListener('pagehide', runAll)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') runAll()
    })
  }
  return () => {
    pending.delete(flush)
  }
}
