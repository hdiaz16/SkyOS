import { create } from 'zustand'

export interface PromptRequest {
  title: string
  description?: string
  placeholder?: string
  confirmLabel?: string
  initialValue?: string
  multiline?: boolean
}

interface DialogState {
  request: PromptRequest | null
  resolve: ((value: string | null) => void) | null
  /** Asks the user for a line of text. Resolves with null when dismissed. */
  ask: (request: PromptRequest) => Promise<string | null>
  close: (value: string | null) => void
}

export const useDialog = create<DialogState>((set, get) => ({
  request: null,
  resolve: null,
  ask: (request) =>
    new Promise((resolve) => {
      get().resolve?.(null)
      set({ request, resolve })
    }),
  close: (value) => {
    get().resolve?.(value)
    set({ request: null, resolve: null })
  },
}))
