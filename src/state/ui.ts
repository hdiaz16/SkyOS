import { create } from 'zustand'

export type MenuItem =
  | { type: 'separator' }
  | { type?: 'item'; label: string; shortcut?: string; danger?: boolean; onSelect: () => void }

export interface ContextMenuState {
  x: number
  y: number
  items: MenuItem[]
}

interface UiState {
  paletteOpen: boolean
  setPalette: (open: boolean) => void
  selection: string[]
  select: (ids: string[]) => void
  toggleSelect: (id: string) => void
  clearSelection: () => void
  renamingId: string | null
  setRenaming: (id: string | null) => void
  contextMenu: ContextMenuState | null
  openMenu: (x: number, y: number, items: MenuItem[]) => void
  closeMenu: () => void
}

export const useUi = create<UiState>((set) => ({
  paletteOpen: false,
  setPalette: (paletteOpen) => set({ paletteOpen }),
  selection: [],
  select: (selection) => set({ selection }),
  toggleSelect: (id) =>
    set((s) => ({
      selection: s.selection.includes(id) ? s.selection.filter((x) => x !== id) : [...s.selection, id],
    })),
  clearSelection: () => set({ selection: [] }),
  renamingId: null,
  setRenaming: (renamingId) => set({ renamingId }),
  contextMenu: null,
  openMenu: (x, y, items) => set({ contextMenu: { x, y, items } }),
  closeMenu: () => set({ contextMenu: null }),
}))
