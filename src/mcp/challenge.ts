export interface Challenge {
  resourceMetadata?: string
  scope?: string
  error?: string
  errorDescription?: string
}

/** Parses `WWW-Authenticate: Bearer a="b", c="d"` into its parameters. */
export function parseChallenge(header: string | null | undefined): Challenge {
  if (!header) return {}
  const out: Record<string, string> = {}
  for (const m of header.matchAll(/([a-zA-Z_]+)\s*=\s*(?:"([^"]*)"|([^,\s]+))/g)) out[m[1]] = m[2] ?? m[3]
  return { resourceMetadata: out.resource_metadata, scope: out.scope, error: out.error, errorDescription: out.error_description }
}
