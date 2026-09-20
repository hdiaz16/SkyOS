/**
 * The single-segment paths (/api/ai/models, /api/ai/proxy). Vercel routes this catch-all as ^/api/ai/([^/]+)$,
 * so the nested paths have their own files next to it (chat/completions.ts, audio/transcriptions.ts).
 */
export const config = { runtime: 'edge' }
export { default } from '../_lib/ai.js'
