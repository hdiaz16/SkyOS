import { create } from 'zustand'

export interface PromptRequest {
  title: string
  description?: string
  placeholder?: string
  confirmLabel?: string
  initialValue?: string
  multiline?: boolean
  /** A question with no field: the answer is the button that was pressed. */
  confirm?: boolean
  /** Paints the confirming button as the serious thing it is. */
  danger?: boolean
  /** Nothing to decide: one button to close, no Cancelar. For telling, not asking. */
  info?: boolean
  /** A password or a key: the field hides what is typed. */
  secret?: boolean
}

interface DialogState {
  request: PromptRequest | null
  resolve: ((value: string | null) => void) | null
  /** Asks the user for a line of text. Resolves with null when dismissed. */
  ask: (request: PromptRequest) => Promise<string | null>
  /** Asks a yes-or-no question. Anything but a clear yes — Escape, the backdrop, Cancel — is a no. */
  confirm: (request: Omit<PromptRequest, 'confirm'>) => Promise<boolean>
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
  confirm: (request) =>
    new Promise<boolean>((resolve) => {
      get().resolve?.(null)
      set({ request: { ...request, confirm: true }, resolve: (value) => resolve(value === 'sí') })
    }),
  close: (value) => {
    get().resolve?.(value)
    set({ request: null, resolve: null })
  },
}))
