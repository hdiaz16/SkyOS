import { useWindows, type Win } from '../state/windows'
import { fs } from '../kernel/fs'
import { ROOT_ID } from '../kernel/types'
import { readProject } from '../kernel/project'
import { MAIN_THREAD, threadOf } from './conversation'
import { useSession } from './session'

/**
 * Which conversation Sky is having. Open a project and Sky is in that project's head: its thread, its goal,
 * its decisions. Leave it and the everyday conversation comes back where it was. Nothing is lost either way —
 * each thread is a row of its own — and Sky is never interrupted mid-answer to be moved somewhere else.
 */

/** Long enough that clicking through folders does not drag the conversation behind it. */
const SETTLE_MS = 400

function topWindow(windows: Win[]): Win | undefined {
  let top: Win | undefined
  for (const w of windows) if (!w.minimized && (!top || w.z > top.z)) top = w
  return top
}

/** The folder the front window is standing in, whether it shows the folder or a file inside it. */
async function folderInFront(): Promise<string | null> {
  const top = topWindow(useWindows.getState().windows)
  if (!top) return null
  if (top.app === 'files') return top.props.folderId ?? ROOT_ID
  if (!top.props.nodeId) return null
  const node = await fs.get(top.props.nodeId)
  return node && node.parentId !== ROOT_ID ? node.parentId : null
}

async function settle(): Promise<void> {
  const session = useSession.getState()
  if (session.running) return
  const folderId = await folderInFront()
  const project = folderId && folderId !== ROOT_ID ? await readProject(folderId) : null
  const thread = project ? threadOf(project.folderId) : MAIN_THREAD
  if (thread === useSession.getState().thread) return
  await useSession.getState().switchThread(thread, project?.name ?? null)
}

/** Follows the desk and keeps the conversation in step with it. Returns the cleanup. */
export function watchProjectThread(): () => void {
  let timer: number | undefined
  const later = () => {
    window.clearTimeout(timer)
    timer = window.setTimeout(() => void settle(), SETTLE_MS)
  }
  const stop = useWindows.subscribe(later)
  later()
  return () => {
    window.clearTimeout(timer)
    stop()
  }
}
