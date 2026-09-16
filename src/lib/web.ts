/** Google allows itself to be framed when this parameter is present. */
export const GOOGLE_HOME = 'https://www.google.com/webhp?igu=1'

export function googleSearchUrl(query: string): string {
  return `https://www.google.com/search?igu=1&q=${encodeURIComponent(query.trim())}`
}

/** A real ending: .com, .mx, .dev, .io — never .5, which is what «3.5» and «v1.2» end in. */
const TLD = /\.[a-z]{2,}$/i
/** Endings that name a file, not a place. Left out on purpose: .io, .co, .sh, .me and .tv are real domains. */
const FILE_END = /\.(txt|md|json|ya?ml|log|csv|pdf|docx?|xlsx?|pptx?|png|jpe?g|gif|svg|webp|mp[34]|zip|rar|exe|dmg|jsx?|tsx?|css|html?)$/i

/**
 * Whether this is meant as an address. Anything with a dot and no spaces used to qualify, so typing «3.5»,
 * «notas.txt» or «v1.2» in the bar went to https://3.5 and left an empty panel instead of searching.
 */
export function looksLikeUrl(raw: string): boolean {
  const s = raw.trim()
  if (/\s/.test(s)) return false
  if (/^https?:\/\//i.test(s)) return parsable(s)
  const [host, port] = s.split(/[/?#]/)[0].split(':')
  // A host with a port is somewhere to go even without a dot: localhost:5173 is where this very desk runs.
  if (/^\d+$/.test(port ?? '') && /^[\w-]+(\.[\w-]+)*$/.test(host)) return true
  return /^[\w-]+(\.[\w-]+)+$/.test(host) && TLD.test(host) && !FILE_END.test(host)
}

/** Whether the browser could actually load it: «https://» alone parses as nothing and framed an empty panel. */
function parsable(s: string): boolean {
  try {
    return !!new URL(s).hostname
  } catch {
    return false
  }
}

/** Turns free text into something the browser can load: a URL as-is, a bare domain with https, or a Google search. */
export function toNavigableUrl(raw: string): string {
  const s = raw.trim()
  if (!s) return GOOGLE_HOME
  if (/^https?:\/\//i.test(s)) return parsable(s) ? s : googleSearchUrl(s)
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
