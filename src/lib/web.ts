/** Google allows itself to be framed when this parameter is present. */
export const GOOGLE_HOME = 'https://www.google.com/webhp?igu=1'

export function googleSearchUrl(query: string): string {
  return `https://www.google.com/search?igu=1&q=${encodeURIComponent(query.trim())}`
}

export function looksLikeUrl(raw: string): boolean {
  const s = raw.trim()
  if (/\s/.test(s)) return false
  if (/^https?:\/\//i.test(s)) return true
  return /^[\w-]+(\.[\w-]+)+(:\d+)?(\/.*)?$/.test(s)
}

/** Turns free text into something the browser can load: a URL as-is, a bare domain with https, or a Google search. */
export function toNavigableUrl(raw: string): string {
  const s = raw.trim()
  if (!s) return GOOGLE_HOME
  if (/^https?:\/\//i.test(s)) return s
  if (looksLikeUrl(s)) return `https://${s}`
  return googleSearchUrl(s)
}

export function titleForUrl(url: string): string {
  try {
    const u = new URL(url)
    if (u.hostname.endsWith('google.com')) {
      const q = u.searchParams.get('q')
      return q ? `Google · ${q}` : 'Google'
    }
    return u.hostname.replace(/^www\./, '')
  } catch {
    return 'Navegador'
  }
}
