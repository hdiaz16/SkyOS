import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './kernel/commands/index'
import App from './App.tsx'
import { dispatch, listCommands, useJournal } from './kernel/commands'
import { fs } from './kernel/fs'
import { useUi } from './state/ui'
import { useWindows } from './state/windows'

if (import.meta.env.DEV) {
  // Debug handle: window.mesa.dispatch('fs.createFolder', { name: 'Demo' })
  Object.assign(window, { mesa: { dispatch, listCommands, fs, useUi, useWindows, useJournal } })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
