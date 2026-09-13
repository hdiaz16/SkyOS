import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './kernel/commands/index'
import './ai/commands'
import { Shell } from './components/system/Shell'
import { dispatch, listCommands, useJournal } from './kernel/commands'
import { fs } from './kernel/fs'
import { useUi } from './state/ui'
import { useWindows } from './state/windows'
import { useSession } from './ai/session'
import { useAiSettings } from './ai/settings'
import { commandTools } from './ai/tools'
import { useTasks } from './ai/tasks'
import { useSnap } from './ai/snap'
import { widgets } from './kernel/widgets'
import { flows } from './kernel/flows'
import { calculate } from './lib/calc'
import { useAuth } from './system/auth'
import { users } from './system/users'

if (import.meta.env.DEV) {
  // Debug handle: window.mesa.dispatch('fs.createFolder', { name: 'Demo' })
  Object.assign(window, {
    mesa: {
      dispatch,
      listCommands,
      fs,
      widgets,
      flows,
      calculate,
      useUi,
      useWindows,
      useJournal,
      ai: { useSession, useAiSettings, useTasks, useSnap, commandTools },
      system: { useAuth, users },
    },
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Shell />
  </StrictMode>,
)
