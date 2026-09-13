/** Pulls the first JSON object or array out of a model reply, tolerating prose and code fences around it. */
export function extractJson<T = unknown>(text: string): T | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidates = [fenced?.[1], text]
  for (const c of candidates) {
    if (!c) continue
    const start = Math.min(...['[', '{'].map((ch) => c.indexOf(ch)).filter((i) => i >= 0))
    if (!Number.isFinite(start)) continue
    const end = Math.max(c.lastIndexOf(']'), c.lastIndexOf('}'))
    if (end <= start) continue
    try {
      return JSON.parse(c.slice(start, end + 1)) as T
    } catch {
      /* try next candidate */
    }
  }
  return null
}

/** FNV-1a, enough to detect content changes cheaply. */
export function hashText(text: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16)
}
