import { create } from 'zustand'

export type MenuItem =
  | { type: 'separator' }
  | { type: 'label'; label: string }
  | { type?: 'item'; label: string; shortcut?: string; danger?: boolean; onSelect: () => void }

export interface ContextMenuState {
  x: number
  y: number
  items: MenuItem[]
  /** Changes on every open so the same position still remounts the menu. */
  nonce: number
}

interface UiState {
  /** Increments each time something asks the command bar to take focus. */
  composerFocus: number
  focusComposer: () => void
  selection: string[]
  select: (ids: string[]) => void
  toggleSelect: (id: string) => void
  clearSelection: () => void
  renamingId: string | null
  setRenaming: (id: string | null) => void
  contextMenu: ContextMenuState | null
  openMenu: (x: number, y: number, items: MenuItem[]) => void
  closeMenu: () => void
  /** Half or whole of the screen a dragged window would snap to if released now. */
  snapPreview: 'left' | 'right' | 'max' | null
  setSnapPreview: (target: 'left' | 'right' | 'max' | null) => void
}

let menuNonce = 0

export const useUi = create<UiState>((set) => ({
  composerFocus: 0,
  focusComposer: () => set((s) => ({ composerFocus: s.composerFocus + 1 })),
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
  openMenu: (x, y, items) => set({ contextMenu: { x, y, items, nonce: ++menuNonce } }),
  closeMenu: () => set({ contextMenu: null }),
  snapPreview: null,
  setSnapPreview: (snapPreview) => set((s) => (s.snapPreview === snapPreview ? s : { snapPreview })),
}))
