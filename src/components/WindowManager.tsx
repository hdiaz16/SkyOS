import { AnimatePresence } from 'motion/react'
import { useWindows, type Win } from '../state/windows'
import { WindowFrame } from './WindowFrame'
import { FilesApp } from './apps/Files'
import { TextEditor } from './apps/TextEditor'
import { ImageViewer } from './apps/ImageViewer'
import { PdfViewer } from './apps/PdfViewer'
import { BrowserApp } from './apps/Browser'
import { ResultApp } from './apps/Result'
import { TerminalApp } from './apps/Terminal'
import { TrashApp } from './apps/Trash'
import { SettingsApp } from './apps/Settings'

function renderApp(win: Win) {
  switch (win.app) {
    case 'files':
      return <FilesApp win={win} />
    case 'editor':
      return <TextEditor win={win} />
    case 'image':
      return <ImageViewer win={win} />
    case 'pdf':
      return <PdfViewer win={win} />
    case 'browser':
      return <BrowserApp win={win} />
    case 'result':
      return <ResultApp win={win} />
    case 'terminal':
      return <TerminalApp />
    case 'trash':
      return <TrashApp />
    case 'settings':
      return <SettingsApp />
  }
}

export function WindowManager() {
  const windows = useWindows((s) => s.windows)
  const topZ = windows.reduce((m, w) => (w.minimized ? m : Math.max(m, w.z)), -1)
  return (
    <AnimatePresence>
      {windows.map((w) => (
        <WindowFrame key={w.id} win={w} active={w.z === topZ}>
          {renderApp(w)}
        </WindowFrame>
      ))}
    </AnimatePresence>
  )
}
