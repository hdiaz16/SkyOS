import { fs } from '../kernel/fs'
import { fileKind, type FsNode } from '../kernel/types'
import { useUi } from '../state/ui'
import { getProvider } from './providers'
import { useSession } from './session'
import { useAiSettings } from './settings'
import type { Attachment, ImageMediaType } from './types'

const IMAGE_TYPES: ImageMediaType[] = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']
const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const MAX_PDF_BYTES = 8 * 1024 * 1024
const MAX_TEXT_BYTES = 400 * 1024
const MAX_ATTACHED = 12
/** Inline text per request: metered free tiers get a tight budget, the rest can carry whole documents. */
const TEXT_BUDGET = { metered: { perFile: 3000, total: 9000 }, roomy: { perFile: 40_000, total: 200_000 } }

const textBudget = () => (useAiSettings.getState().provider === 'groq' ? TEXT_BUDGET.metered : TEXT_BUDGET.roomy)

export async function blobToBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer())
  let bin = ''
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000))
  return btoa(bin)
}

/** Whether Sky can look at this file directly: text always, images with vision, PDFs with a provider that reads documents. */
export function canAttach(node: FsNode): boolean {
  const kind = fileKind(node)
  const caps = getProvider()?.capabilities
  if (kind === 'text') return node.size <= MAX_TEXT_BYTES
  if (kind === 'image') return node.size <= MAX_IMAGE_BYTES && !!caps?.vision
  if (kind === 'pdf') return node.size <= MAX_PDF_BYTES && !!caps?.documents
  return false
}

export async function attachmentFor(node: FsNode): Promise<Attachment | null> {
  const kind = fileKind(node)
  if (kind === 'text') {
    const text = await fs.readText(node.id)
    return text.trim() ? { type: 'file', name: node.name, text: text.slice(0, textBudget().perFile), nodeId: node.id } : null
  }
  const blob = await fs.readBlob(node.id)
  if (!blob) return null
  if (kind === 'image') {
    const mediaType = (IMAGE_TYPES.find((t) => t === blob.type) ?? 'image/png') as ImageMediaType
    return { type: 'image', mediaType, data: await blobToBase64(blob) }
  }
  if (kind === 'pdf') return { type: 'document', mediaType: 'application/pdf', data: await blobToBase64(blob), title: node.name }
  return null
}

/**
 * Puts files in the command bar, ready for the person to say what to do with them: text inline within the
 * provider's budget, images and PDFs as they are. Folders contribute their direct files. Returns how many made it.
 */
export async function attachNodesToSky(ids: string[]): Promise<number> {
  const nodes: FsNode[] = []
  for (const id of ids) {
    const node = await fs.get(id)
    if (!node || node.trashedAt !== null) continue
    if (node.kind === 'folder') nodes.push(...(await fs.list(node.id)).filter((n) => n.kind === 'file'))
    else nodes.push(node)
  }
  const session = useSession.getState()
  let budget = textBudget().total
  let count = 0
  for (const node of nodes) {
    if (count >= MAX_ATTACHED) break
    if (!canAttach(node)) continue
    const part = await attachmentFor(node)
    if (!part) continue
    if (part.type === 'file') {
      if (budget <= 0) break
      part.text = part.text.slice(0, budget)
      budget -= part.text.length
    }
    session.attach(part, node.name)
    count++
  }
  if (count) useUi.getState().focusComposer()
  return count
}
