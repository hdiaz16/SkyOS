import { create } from 'zustand'

/**
 * Whether the network is there. Everything local (files, windows, canvases, search) works without it; what
 * needs it (Sky, connected apps, the cloud) waits its turn instead of failing loudly.
 */

interface NetworkState {
  online: boolean
  /** When the connection was last lost, for the status pill. */
  since: number | null
}

export const useNetwork = create<NetworkState>(() => ({ online: typeof navigator === 'undefined' ? true : navigator.onLine, since: null }))

/** Follows the browser's online/offline events; returns the cleanup. */
export function watchNetwork(): () => void {
  const on = () => useNetwork.setState({ online: true, since: null })
  const off = () => useNetwork.setState({ online: false, since: Date.now() })
  window.addEventListener('online', on)
  window.addEventListener('offline', off)
  return () => {
    window.removeEventListener('online', on)
    window.removeEventListener('offline', off)
  }
}

/** Resolves when the network is back (immediately if it never left). */
export function whenOnline(): Promise<void> {
  if (useNetwork.getState().online) return Promise.resolve()
  return new Promise((resolve) => {
    const unsub = useNetwork.subscribe((s) => {
      if (s.online) {
        unsub()
        resolve()
      }
    })
  })
}
