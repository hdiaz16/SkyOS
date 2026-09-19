import { lazy, Suspense } from 'react'
import { AnimatePresence } from 'motion/react'
import { useWindows, type Win } from '../state/windows'
import { WindowFrame } from './WindowFrame'
import { FilesApp } from './apps/Files'
import { TextEditor } from './apps/TextEditor'
import { ImageViewer } from './apps/ImageViewer'
import { BrowserApp } from './apps/Browser'
import { ResultApp } from './apps/Result'
import { TerminalApp } from './apps/Terminal'
import { TrashApp } from './apps/Trash'
import { SettingsApp } from './apps/Settings'
import { OfficeViewer } from './apps/OfficeViewer'
import { AppView } from './apps/AppView'
import { CanvasApp } from './apps/Canvas'
import { SnapPreview } from './SnapPreview'

// pdf.js pesa más que todo el resto del escritorio junto, y el entry lo cargaba entero en cada arranque
// aunque nadie abriera un PDF. Viaja en su propio chunk y llega la primera vez que se abre uno.
const PdfViewer = lazy(() => import('./apps/PdfViewer').then((m) => ({ default: m.PdfViewer })))

function renderApp(win: Win) {
  switch (win.app) {
    case 'files':
      return <FilesApp win={win} />
    case 'editor':
      return <TextEditor win={win} />
    case 'image':
      return <ImageViewer win={win} />
    case 'pdf':
      return (
        <Suspense fallback={<div className="flex h-full items-center justify-center text-[13px] text-ink-3">Abriendo el documento…</div>}>
          <PdfViewer win={win} />
        </Suspense>
      )
    case 'browser':
      return <BrowserApp win={win} />
    case 'result':
      return <ResultApp win={win} />
    case 'terminal':
      return <TerminalApp />
    case 'trash':
      return <TrashApp />
    case 'settings':
      return <SettingsApp win={win} />
    case 'office':
      return <OfficeViewer win={win} />
    case 'app':
      return <AppView win={win} />
    case 'canvas':
      return <CanvasApp win={win} />
  }
}

export function WindowManager() {
  const windows = useWindows((s) => s.windows)
  const topZ = windows.reduce((m, w) => (w.minimized ? m : Math.max(m, w.z)), -1)
  return (
    <>
      <AnimatePresence>
        {windows.map((w) => (
          <WindowFrame key={w.id} win={w} active={w.z === topZ}>
            {renderApp(w)}
          </WindowFrame>
        ))}
      </AnimatePresence>
      <SnapPreview />
    </>
  )
}
