/**
 * Opens the native file picker. Must be called synchronously inside a user gesture.
 * Resolves with an empty array when the user cancels.
 */
export function pickFiles(): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = true
    input.style.display = 'none'
    document.body.appendChild(input)
    const done = (files: File[]) => {
      input.remove()
      resolve(files)
    }
    input.addEventListener('change', () => done(input.files ? [...input.files] : []), { once: true })
    input.addEventListener('cancel', () => done([]), { once: true })
    input.click()
  })
}
