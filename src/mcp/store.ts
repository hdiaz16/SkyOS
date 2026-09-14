import { db } from '../kernel/db'
import type { McpServerRecord, OAuthClient } from './types'

/**
 * MCP servers and OAuth client registrations live in the signed-in user's database, next to their files:
 * another account in the same browser never sees them, and signing out leaves them in place.
 */
export const mcpStore = {
  servers: {
    list: (): Promise<McpServerRecord[]> => db.mcpServers.toArray(),
    get: (id: string): Promise<McpServerRecord | undefined> => db.mcpServers.get(id),
    async save(record: McpServerRecord): Promise<McpServerRecord> {
      await db.mcpServers.put(record)
      return record
    },
    /** Merges a patch into the stored record atomically (Dexie's update touches only the given keys); a no-op when the record is gone. */
    async patch(id: string, patch: Partial<McpServerRecord>): Promise<McpServerRecord | undefined> {
      const changed = await db.mcpServers.update(id, { ...patch, updatedAt: Date.now() })
      return changed ? db.mcpServers.get(id) : undefined
    },
    remove: (id: string): Promise<void> => db.mcpServers.delete(id),
  },

  clients: {
    get: (issuer: string): Promise<OAuthClient | undefined> => db.oauthClients.get(issuer),
    async save(client: OAuthClient): Promise<OAuthClient> {
      await db.oauthClients.put(client)
      return client
    },
    remove: (issuer: string): Promise<void> => db.oauthClients.delete(issuer),
  },
}
