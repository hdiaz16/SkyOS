import { create } from 'zustand'

/**
 * Mood of the single pre-desktop orb. Screens set it; the OrbStage component renders it.
 * Kept apart from the component so Fast Refresh can treat OrbStage.tsx as pure UI.
 */
export type OrbMode = 'hidden' | 'idle' | 'busy' | 'rush' | 'flood'

interface OrbStageState {
  mode: OrbMode
  setMode: (mode: OrbMode) => void
}

export const useOrbStage = create<OrbStageState>((set) => ({
  mode: 'busy',
  setMode: (mode) => set({ mode }),
}))

export const ORB_SIZE = 132
/** Vertical anchor of the orb's center, as a share of the viewport height. */
export const ORB_TOP = '38%'
/** Where text below the orb starts. */
export const BELOW_ORB = `calc(${ORB_TOP} + ${ORB_SIZE / 2 + 30}px)`
