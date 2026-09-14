/**
 * Notion's MCP returns pages as "Notion-flavored Markdown": standard Markdown wrapped in XML-like tags
 * (<page>, <content>, <callout>, <columns>, <toggle>…) with tabs for nesting and a preamble line.
 * This turns it into plain GitHub-flavored Markdown that reads like the page does in Notion.
 * Code fences are left untouched: they often contain literal <placeholders> and heredoc <<EOF markers.
 */

const WRAPPER_BLOCKS = ['ancestor-path', 'properties', 'iconMetadata', 'meta', 'database-metadata']
const TRANSPARENT_TAGS = ['page', 'content', 'columns', 'column', 'column-list', 'table', 'synced-block', 'quote', 'audio', 'video', 'file', 'pdf', 'embed', 'bookmark']

export interface NotionPageText {
  title?: string
  markdown: string
}

function stripPreamble(raw: string): string {
  return raw.replace(/^Here is the result of[^\n]*\n/, '')
}

function stripWrapperBlocks(text: string): string {
  let out = text
  for (const tag of WRAPPER_BLOCKS) out = out.replace(new RegExp(`<${tag}(?:\\s[^>]*)?>[\\s\\S]*?<\\/${tag}>\\s*`, 'g'), '')
  return out
}

/** A callout keeps its icon and reads as a quote; a toggle shows its title in bold with the body below. */
function convertBlockTags(line: string): string {
  return line
    .replace(/<callout(?:\s+icon="([^"]*)")?[^>]*>/g, (_m, icon: string | undefined) => `> ${icon && !icon.startsWith('notion://') ? `${icon} ` : ''}`)
    .replace(/<\/callout>/g, '')
    .replace(/<toggle(?:\s[^>]*)?>\s*([^\n<]*)/g, (_m, title: string) => (title.trim() ? `**${title.trim()}**` : ''))
    .replace(/<\/toggle>/g, '')
    .replace(/<page\s+url="([^"]+)"(?:\s+title="([^"]*)")?[^>]*\/>/g, (_m, url: string, title?: string) => `[${title ?? 'Página'}](${url})`)
    .replace(/<page\s+url="([^"]+)"[^>]*>([^<]*)<\/page>/g, (_m, url: string, title: string) => `[${title || 'Página'}](${url})`)
    .replace(/<mention-(?:user|date|page)[^>]*>([^<]*)<\/mention-[a-z]+>/g, '$1')
    .replace(/<equation[^>]*>([^<]*)<\/equation>/g, '`$1`')
    .replace(/<img[^>]*src="([^"]+)"[^>]*\/?>/g, '![]($1)')
}

function stripTransparentTags(line: string): string {
  let out = line
  for (const tag of TRANSPARENT_TAGS) out = out.replace(new RegExp(`<\\/?${tag}(?:\\s[^>]*)?>`, 'g'), '')
  return out
}

/** Notion nests with tabs; Markdown nests with four spaces. A fence language like "plain text" becomes one word. */
export function notionToMarkdown(raw: string): string {
  const body = stripWrapperBlocks(stripPreamble(raw))
  const out: string[] = []
  let inFence = false
  for (const original of body.split('\n')) {
    if (/^\s*```/.test(original)) {
      inFence = !inFence
      out.push(inFence ? original.replace(/^(\s*```)\s*(.*)$/, (_m, fence: string, lang: string) => `${fence}${lang.trim().split(/\s+/)[0]}`) : original)
      continue
    }
    if (inFence) {
      out.push(original)
      continue
    }
    const line = stripTransparentTags(convertBlockTags(original))
    if (!line.trim() && original.trim()) continue // a line that was only a wrapper tag
    out.push(line.replace(/^\t+/, (tabs) => '    '.repeat(tabs.length)))
  }
  return out
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Splits the fetch result into title and Markdown body. */
export function notionPage(data: { title?: string; text?: string } | string): NotionPageText {
  if (typeof data === 'string') return { markdown: notionToMarkdown(data) }
  return { title: data.title, markdown: notionToMarkdown(data.text ?? '') }
}
