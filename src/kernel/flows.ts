import { nanoid } from 'nanoid'
import { db, type FlowRow } from './db'

/** Saved routines: a name the user can type in the bar, and the natural-language steps Sky runs. */

export const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')

export const flows = {
  list: () => db.flows.orderBy('updatedAt').reverse().toArray(),
  get: (id: string) => db.flows.get(id),
  bySlug: (slug: string) => db.flows.where('slug').equals(slug).first(),

  async findByName(name: string): Promise<FlowRow | undefined> {
    const slug = slugify(name)
    const exact = await flows.bySlug(slug)
    if (exact) return exact
    const all = await db.flows.toArray()
    return all.find((f) => f.slug.includes(slug) || slug.includes(f.slug))
  },

  async save(name: string, instructions: string): Promise<{ flow: FlowRow; replaced?: FlowRow }> {
    const clean = name.trim()
    if (!clean) throw new Error('El flujo necesita un nombre')
    if (!instructions.trim()) throw new Error('El flujo necesita instrucciones')
    const slug = slugify(clean)
    const existing = await flows.bySlug(slug)
    const t = Date.now()
    const flow: FlowRow = existing
      ? { ...existing, name: clean, instructions: instructions.trim(), updatedAt: t }
      : { id: nanoid(8), name: clean, slug, instructions: instructions.trim(), createdAt: t, updatedAt: t, uses: 0 }
    await db.flows.put(flow)
    return { flow, replaced: existing }
  },

  async remove(id: string): Promise<FlowRow | undefined> {
    const row = await db.flows.get(id)
    if (row) await db.flows.delete(id)
    return row
  },

  restore: (row: FlowRow) => db.flows.put(row),

  async touch(id: string): Promise<void> {
    const row = await db.flows.get(id)
    if (row) await db.flows.update(id, { uses: row.uses + 1 })
  },

  async search(query: string, limit = 4): Promise<FlowRow[]> {
    const q = slugify(query)
    if (!q) return []
    const all = await db.flows.toArray()
    return all.filter((f) => f.slug.includes(q) || slugify(f.instructions).includes(q)).slice(0, limit)
  },
}
