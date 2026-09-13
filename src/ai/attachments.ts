import { fs } from '../kernel/fs'
import { fileKind, type FsNode } from '../kernel/types'
import { useUi } from '../state/ui'
import { getProvider } from './providers'
import { useSession } from './session'
import type { Attachment, ImageMediaType } from './types'

const IMAGE_TYPES: ImageMediaType[] = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']
const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const MAX_PDF_BYTES = 8 * 1024 * 1024

export async function blobToBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer())
  let bin = ''
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000))
  return btoa(bin)
}

/** Whether Sky can look at this file directly (images always; PDFs only with a provider that reads documents). */
export function canAttach(node: FsNode): boolean {
  const kind = fileKind(node)
  const caps = getProvider()?.capabilities
  if (kind === 'image') return node.size <= MAX_IMAGE_BYTES && !!caps?.vision
  if (kind === 'pdf') return node.size <= MAX_PDF_BYTES && !!caps?.documents
  return false
}

export async function attachmentFor(node: FsNode): Promise<Attachment | null> {
  const blob = await fs.readBlob(node.id)
  if (!blob) return null
  const kind = fileKind(node)
  if (kind === 'image') {
    const mediaType = (IMAGE_TYPES.find((t) => t === blob.type) ?? 'image/png') as ImageMediaType
    return { type: 'image', mediaType, data: await blobToBase64(blob) }
  }
  if (kind === 'pdf') return { type: 'document', mediaType: 'application/pdf', data: await blobToBase64(blob), title: node.name }
  return null
}

/** Puts a file in the command bar, ready for the user to say what to do with it. */
export async function attachNodeToMesa(node: FsNode): Promise<void> {
  const part = await attachmentFor(node)
  if (!part) return
  useSession.getState().attach(part, node.name)
  useUi.getState().focusComposer()
}
