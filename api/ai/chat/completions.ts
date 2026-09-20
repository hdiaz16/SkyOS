/**
 * Sky's included model, at the path the desktop calls for conversation. The handler lives in _lib/ai.ts; this file
 * exists because Vercel's zero-config routing turned the catch-all [...path].ts into a single-segment route
 * (^/api/ai/([^/]+)$), so /api/ai/chat/completions never reached it and the published desktop had no included AI
 * at all. One function file per real path is routing nobody can get wrong.
 */
export const config = { runtime: 'edge' }
export { default } from '../../_lib/ai.js'
