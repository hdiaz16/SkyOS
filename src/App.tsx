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
import { AiBackground } from './components/AiBackground'
import { Departure } from './components/system/Departure'
import { useSettings, applyTheme } from './state/settings'
import { useUi } from './state/ui'
import { dispatch, undoLast } from './kernel/commands'
import { firstBoot } from './system/firstBoot'
import { mcp } from './mcp/manager'
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
    void firstBoot()
    navigator.storage?.persist?.().catch(() => undefined)
    // Connected apps: finish a pending authorization, renew tokens, keep sessions alive while the desktop is open.
    return mcp.start()
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      const ui = useUi.getState()
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        ui.focusComposer()
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
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="relative h-full w-full overflow-hidden">
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
      <AiBackground />
      <Departure />
    </div>
  )
}
