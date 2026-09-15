import { useEffect } from 'react'
import { Backdrop } from './components/Backdrop'
import { Desktop } from './components/Desktop'
import { WidgetLayer } from './components/widgets/WidgetLayer'
import { WindowManager } from './components/WindowManager'
import { TopBar } from './components/TopBar'
import { CommandBar } from './components/CommandBar'
import { ContextMenu } from './components/ContextMenu'
import { PromptDialog } from './components/PromptDialog'
import { SnapOverlay } from './components/SnapOverlay'
import { Toasts } from './components/Toasts'
import { JobCards } from './components/JobCards'
import { AiBackground } from './components/AiBackground'
import { Departure } from './components/system/Departure'
import { useSettings, applyTheme } from './state/settings'
import { useUi } from './state/ui'
import { dispatch, undoLast } from './kernel/commands'
import { firstBoot } from './system/firstBoot'
import { useSession } from './ai/session'
import { mcp } from './mcp/manager'
import { startSync } from './system/sync'
import { watchNetwork } from './system/network'
import { startWorkspace } from './state/workspace'
import { fitAll } from './state/windows'
import { startJournal } from './kernel/journal'
import { watchProjectThread } from './ai/threads'
import { armAudio, play } from './system/sound'
import { isEditableTarget } from './lib/utils'

export default function App() {
  const theme = useSettings((s) => s.theme)

  useEffect(() => {
    applyTheme(theme)
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => applyTheme(useSettings.getState().theme)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [theme])

  useEffect(() => {
    void useSession
      .getState()
      .load()
      .finally(() => void firstBoot())
    navigator.storage?.persist?.().catch(() => undefined)
    // Connected apps: finish a pending authorization, renew tokens, keep sessions alive while the desktop is open.
    const stopMcp = mcp.start()
    // Cloud sync: finish a OneDrive sign-in, then keep the person's cloud in step.
    const stopSync = startSync()
    const stopNetwork = watchNetwork()
    const disarmAudio = armAudio()
    // The desk as it was left: restored before anything else can open a window of its own.
    let stopWorkspace: (() => void) | undefined
    void startWorkspace().then((stop) => {
      stopWorkspace = stop
    })
    // And what was done to it, so "deshacer" still means something after a reload.
    let stopJournal: (() => void) | undefined
    void startJournal().then((stop) => {
      stopJournal = stop
    })
    // Open a project and Sky is in that project's conversation; leave it and the everyday one comes back.
    const stopThreads = watchProjectThread()
    // A window whose header lands past the edge of a screen that just got smaller cannot be grabbed back.
    let fitting: number | undefined
    const onResize = () => {
      window.clearTimeout(fitting)
      fitting = window.setTimeout(fitAll, 180)
    }
    window.addEventListener('resize', onResize)
    return () => {
      stopMcp()
      stopSync()
      stopNetwork()
      disarmAudio()
      stopWorkspace?.()
      stopJournal?.()
      stopThreads()
      window.clearTimeout(fitting)
      window.removeEventListener('resize', onResize)
    }
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      const ui = useUi.getState()
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        play('tap')
        ui.focusComposer()
        return
      }
      if (mod && e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        void dispatch('ui.zen')
        return
      }
      if (isEditableTarget(e.target)) return
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        void undoLast()
        return
      }
      if (ui.renamingId) return
      if (e.key === 'Escape') {
        ui.clearSelection()
        ui.closeMenu()
        return
      }
      if (!ui.selection.length) return
      if (e.key === 'Delete') {
        void dispatch('fs.trash', { ids: ui.selection })
        ui.clearSelection()
      } else if (e.key === 'Enter' && ui.selection.length === 1) {
        void dispatch('ui.open', { id: ui.selection[0] })
      } else if (e.key === 'F2' && ui.selection.length === 1) {
        ui.setRenaming(ui.selection[0])
      }
    }
    // In the capture phase: every text field in the app stops keys from bubbling, which is right for the
    // field and wrong for the two shortcuts that have to work from anywhere. They get seen first, and the
    // check below still leaves ordinary typing alone.
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

  // overflow-clip, not hidden: a grid or editor focusing an off-screen input can scroll a hidden box by script; a clipped one never moves.
  return (
    <div className="relative h-full w-full overflow-clip">
      <Backdrop />
      <Desktop />
      <WidgetLayer />
      <WindowManager />
      <TopBar />
      <CommandBar />
      <ContextMenu />
      <PromptDialog />
      <SnapOverlay />
      <Toasts />
      <JobCards />
      <AiBackground />
      <Departure />
    </div>
  )
}
