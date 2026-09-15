import { defineConfig } from 'vitest/config'

/**
 * Tests for the parts where a mistake is expensive and invisible: what survives a reload, what the relay lets
 * through, and when Sky has to ask before acting. They run in Node against pure functions — no browser, no
 * database — so they stay fast enough to run on every change.
 */
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'api/**/*.test.ts'],
    environment: 'node',
  },
})
