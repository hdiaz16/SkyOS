export type NodeKind = 'folder' | 'file'

export interface FsNode {
  id: string
  /** 'root' for top-level items. */
  parentId: string
  name: string
  kind: NodeKind
  /** Empty string for folders. */
  mime: string
  size: number
  createdAt: number
  updatedAt: number
  /** Set when the node is in the trash. */
  trashedAt: number | null
  /** Free-form labels, usually suggested by the AI when a file arrives. */
  tags?: string[]
}

export const ROOT_ID = 'root'

export type FileKind = 'folder' | 'text' | 'image' | 'pdf' | 'other'

const TEXT_EXT = new Set([
  'txt', 'md', 'markdown', 'json', 'csv', 'js', 'ts', 'tsx', 'jsx', 'html', 'css',
  'xml', 'yml', 'yaml', 'log', 'sql', 'py', 'sh', 'toml', 'ini', 'env',
])
const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif', 'bmp'])

export function extOf(name: string): string {
  const i = name.lastIndexOf('.')
  return i > 0 ? name.slice(i + 1).toLowerCase() : ''
}

export function fileKind(node: Pick<FsNode, 'kind' | 'mime' | 'name'>): FileKind {
  if (node.kind === 'folder') return 'folder'
  const ext = extOf(node.name)
  if (node.mime.startsWith('image/') || IMAGE_EXT.has(ext)) return 'image'
  if (node.mime === 'application/pdf' || ext === 'pdf') return 'pdf'
  if (node.mime.startsWith('text/') || node.mime === 'application/json' || TEXT_EXT.has(ext)) return 'text'
  return 'other'
}

export function mimeFor(name: string, fallback = ''): string {
  if (fallback) return fallback
  const ext = extOf(name)
  switch (ext) {
    case 'md':
    case 'markdown':
      return 'text/markdown'
    case 'txt':
      return 'text/plain'
    case 'json':
      return 'application/json'
    case 'csv':
      return 'text/csv'
    case 'html':
      return 'text/html'
    case 'pdf':
      return 'application/pdf'
    case 'png':
      return 'image/png'
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg'
    case 'gif':
      return 'image/gif'
    case 'webp':
      return 'image/webp'
    case 'svg':
      return 'image/svg+xml'
    default:
      return TEXT_EXT.has(ext) ? 'text/plain' : 'application/octet-stream'
  }
}
