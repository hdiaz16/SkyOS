import { defineConfig } from 'vitest/config'

export default defineConfig({ test: { environment: 'node', include: ['docs/auditoria/2026-09-16/reproduce.test.ts'] } })
