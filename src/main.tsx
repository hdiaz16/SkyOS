import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './kernel/commands/index'
import './ai/commands'
import App from './App.tsx'
import { dispatch, listCommands, useJournal } from './kernel/commands'
import { fs } from './kernel/fs'
import { useUi } from './state/ui'
import { useWindows } from './state/windows'
import { useSession } from './ai/session'
import { useAiSettings } from './ai/settings'
import { commandTools } from './ai/tools'
import { useTasks } from './ai/tasks'
import { widgets } from './kernel/widgets'

if (import.meta.env.DEV) {
  // Debug handle: window.mesa.dispatch('fs.createFolder', { name: 'Demo' })
  Object.assign(window, {
    mesa: { dispatch, listCommands, fs, widgets, useUi, useWindows, useJournal, ai: { useSession, useAiSettings, useTasks, commandTools } },
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
