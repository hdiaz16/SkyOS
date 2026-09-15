import { runAgent } from './agent'
import { extractJson } from './json'
import { fastModelFor, isAiConfigured } from './settings'
import { fs } from '../kernel/fs'
import { ROOT_ID, fileKind, type FsNode } from '../kernel/types'
import { dispatch, useToasts } from '../kernel/commands'

interface Suggestion {
  id: string
  folderId: string | null
  folder?: string
  tags?: string[]
  confidence?: number
}

const MAX_FILES = 12
const EXCERPT = 1500
const MIN_CONFIDENCE = 0.6

/**
 * After files land on the desktop, asks the model where they belong and how to tag them.
 * Tags are applied quietly; moves are only suggested, one click away, never forced.
 */
export async function suggestPlacement(created: FsNode[]): Promise<void> {
  if (!isAiConfigured() || !created.length || created.length > MAX_FILES) return
  const folders = (await fs.list(ROOT_ID)).filter((n) => n.kind === 'folder')
  if (!folders.length) return

  const folderLines = await Promise.all(
    folders.map(async (f) => {
      const children = await fs.list(f.id)
      const sub = children.filter((c) => c.kind === 'folder').map((c) => c.name)
      const sample = children.filter((c) => c.kind === 'file').slice(0, 5).map((c) => c.name)
      return `- ${f.name} (id ${f.id})${sub.length ? ` · subcarpetas: ${sub.join(', ')}` : ''}${sample.length ? ` · contiene: ${sample.join(', ')}` : ''}`
    }),
  )

  const files = await Promise.all(
    created.map(async (n) => {
      const kind = fileKind(n)
      const excerpt = kind === 'text' ? (await fs.readText(n.id).catch(() => '')).slice(0, EXCERPT) : ''
      return { id: n.id, name: n.name, type: kind, excerpt }
    }),
  )

  const prompt = [
    'Carpetas del escritorio:',
    ...folderLines,
    '',
    'Archivos recién importados:',
    JSON.stringify(files, null, 1),
    '',
    'Para cada archivo indica la carpeta más adecuada (folderId) o null si ninguna aplica con claridad, tu confianza de 0 a 1, y de 1 a 4 etiquetas cortas en minúsculas que describan el contenido.',
    'Responde únicamente con JSON: [{"id":"...","folderId":"...|null","folder":"nombre","confidence":0.0,"tags":["..."]}]',
  ].join('\n')

  let text: string
  try {
    text = (
      await runAgent({
        prompt,
        systemOverride: 'Clasificas archivos recién llegados a un escritorio. Responde únicamente con JSON válido, sin explicaciones ni texto alrededor.',
        tools: [],
        withoutState: true,
        model: fastModelFor(),
        maxTokens: 2500,
      })
    ).text
  } catch {
    return
  }

  const suggestions = extractJson<Suggestion[]>(text)
  if (!Array.isArray(suggestions)) return

  const byId = new Map(created.map((n) => [n.id, n]))
  const folderIds = new Set(folders.map((f) => f.id))
  const moves: Array<{ node: FsNode; folderId: string; folder: string }> = []

  for (const s of suggestions) {
    const node = byId.get(s.id)
    if (!node) continue
    // Through the command bus: labelling is a change to the person's files, so it respects the autonomy
    // they chose, lands in the log and can be undone like everything else Sky does.
    if (Array.isArray(s.tags) && s.tags.length) {
      await dispatch('fs.setTags', { id: node.id, tags: s.tags.map(String) }, { source: 'ai' }).catch(() => undefined)
    }
    if (s.folderId && folderIds.has(s.folderId) && (s.confidence ?? 1) >= MIN_CONFIDENCE) {
      moves.push({ node, folderId: s.folderId, folder: folders.find((f) => f.id === s.folderId)?.name ?? s.folder ?? 'carpeta' })
    }
  }

  const toasts = useToasts.getState()
  if (moves.length > 3) {
    toasts.push({
      message: `Sky sugiere ordenar ${moves.length} archivos en sus carpetas`,
      kind: 'info',
      duration: 12000,
      action: {
        label: 'Ordenar',
        run: () => {
          for (const m of moves) void dispatch('fs.move', { ids: [m.node.id], targetParentId: m.folderId }, { source: 'ai' })
        },
      },
    })
    return
  }
  for (const m of moves) {
    toasts.push({
      message: `"${m.node.name}" podría ir en ${m.folder}`,
      kind: 'info',
      duration: 12000,
      action: { label: `Mover a ${m.folder}`, run: () => void dispatch('fs.move', { ids: [m.node.id], targetParentId: m.folderId }) },
    })
  }
}
