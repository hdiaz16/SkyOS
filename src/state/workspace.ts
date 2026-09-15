import { db } from '../kernel/db'
import { fs } from '../kernel/fs'
import { useWindows, type Win } from './windows'

/**
 * The desk as you left it. A web page forgets everything on reload, which is exactly what an operating system
 * must not do: windows, where they sat, which one was on top. This keeps that picture in the account's own
 * database and puts it back on the next boot, leaving out whatever no longer exists (a file sent to the trash
 * takes its window with it) and anything that was never worth restoring.
 */

const ROW_ID = 'windows'
const SAVE_DELAY_MS = 400
/** Apps whose window means nothing on its own; they come back when the person asks for them again. */
const NOT_RESTORED = new Set(['result'])

interface StoredWindow {
  id: string
  app: string
  title: string
  x: number
  y: number
  w: number
  h: number
  z: number
  minimized: boolean
  props: Record<string, unknown>
  touchedAt: number
  maximized?: boolean
  prev?: { x: number; y: number; w: number; h: number }
}

const toStored = (w: Win): StoredWindow => ({
  id: w.id,
  app: w.app,
  title: w.title,
  x: w.x,
  y: w.y,
  w: w.w,
  h: w.h,
  z: w.z,
  minimized: w.minimized,
  props: { ...w.props },
  touchedAt: w.touchedAt,
  ...(w.maximized ? { maximized: true } : {}),
  ...(w.prev ? { prev: w.prev } : {}),
})

/** A window is worth restoring when its app still makes sense and whatever it pointed at is still there. */
async function stillValid(w: StoredWindow): Promise<boolean> {
  if (NOT_RESTORED.has(w.app)) return false
  const id = typeof w.props.nodeId === 'string' ? w.props.nodeId : typeof w.props.folderId === 'string' ? w.props.folderId : null
  if (!id || id === 'root') return true
  const node = await fs.get(id)
  return !!node && node.trashedAt === null
}

/** Puts a window back inside the screen it wakes up on, which may be smaller than the one it was left on. */
function fitted(w: StoredWindow): StoredWindow {
  const width = Math.min(w.w, Math.max(320, window.innerWidth - 24))
  const height = Math.min(w.h, Math.max(240, window.innerHeight - 96))
  return {
    ...w,
    w: width,
    h: height,
    x: Math.min(Math.max(8, w.x), Math.max(8, window.innerWidth - width - 8)),
    y: Math.min(Math.max(44, w.y), Math.max(44, window.innerHeight - height - 8)),
  }
}

let timer: number | undefined
let loaded = false

function save(): void {
  if (!loaded) return
  window.clearTimeout(timer)
  timer = window.setTimeout(() => {
    const { windows, nextZ } = useWindows.getState()
    void db.workspace.put({ id: ROW_ID, windows: windows.filter((w) => !NOT_RESTORED.has(w.app)).map(toStored), nextZ, updatedAt: Date.now() })
  }, SAVE_DELAY_MS)
}

/** Restores the desk and then keeps it in step with whatever happens to it. Returns the cleanup. */
export async function startWorkspace(): Promise<() => void> {
  const row = await db.workspace.get(ROW_ID).catch(() => undefined)
  if (row?.windows.length) {
    const kept: StoredWindow[] = []
    for (const raw of row.windows as StoredWindow[]) if (await stillValid(raw)) kept.push(fitted(raw))
    if (kept.length) {
      useWindows.setState({
        windows: kept.map((w) => ({ ...w, app: w.app, props: w.props, settling: false }) as unknown as Win),
        nextZ: Math.max(row.nextZ, ...kept.map((w) => w.z + 1)),
      })
    }
  }
  loaded = true
  return useWindows.subscribe(save)
}

/** Forgets the saved desk. Each account keeps its own, in its own database. */
export const clearWorkspace = (): Promise<void> => db.workspace.delete(ROW_ID)
