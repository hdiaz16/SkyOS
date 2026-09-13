import { useEffect } from 'react'
import { Desktop } from './components/Desktop'
import { WindowManager } from './components/WindowManager'
import { TopBar } from './components/TopBar'
import { Dock } from './components/Dock'
import { CommandPalette } from './components/CommandPalette'
import { ContextMenu } from './components/ContextMenu'
import { Toasts } from './components/Toasts'
import { useSettings, applyTheme } from './state/settings'
import { useUi } from './state/ui'
import { dispatch, undoLast } from './kernel/commands'
import { seedIfEmpty } from './kernel/seed'
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
    void seedIfEmpty()
    navigator.storage?.persist?.().catch(() => undefined)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      const ui = useUi.getState()
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        ui.setPalette(!ui.paletteOpen)
        return
      }
      if (isEditableTarget(e.target) || ui.paletteOpen) return
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
    <div className="wallpaper relative h-full w-full overflow-hidden">
      <Desktop />
      <WindowManager />
      <TopBar />
      <Dock />
      <CommandPalette />
      <ContextMenu />
      <Toasts />
    </div>
  )
}
