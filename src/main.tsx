import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './kernel/commands/index'
import './ai/commands'
import { Shell } from './components/system/Shell'
import { handleCallbackPage, isCallbackPage } from './mcp/popup'
import { dispatch, execute, listCommands, useJournal } from './kernel/commands'
import { useDialog } from './state/dialog'
import { fs } from './kernel/fs'
import { useUi } from './state/ui'
import { useWindows } from './state/windows'
import { useSession } from './ai/session'
import { useAiSettings } from './ai/settings'
import { allTools, commandTools } from './ai/tools'
import { useTasks } from './ai/tasks'
import { useSnap } from './ai/snap'
import { widgets } from './kernel/widgets'
import { flows } from './kernel/flows'
import { calculate } from './lib/calc'
import { useAuth } from './system/auth'
import { users } from './system/users'
import { mcp, useMcp } from './mcp/manager'
import { discoverAuthorizationServer, discoverProtectedResource, obtainClient, parseChallenge } from './mcp/auth'

if (import.meta.env.DEV) {
  // Debug handle: window.mesa.dispatch('fs.createFolder', { name: 'Demo' })
  Object.assign(window, {
    mesa: {
      dispatch,
      execute,
      listCommands,
      useDialog,
      fs,
      widgets,
      flows,
      calculate,
      useUi,
      useWindows,
      useJournal,
      ai: { useSession, useAiSettings, useTasks, useSnap, commandTools, allTools },
      system: { useAuth, users },
      mcp: { mcp, useMcp, auth: { parseChallenge, discoverProtectedResource, discoverAuthorizationServer, obtainClient } },
    },
  })
}

// An OAuth provider sending the person back only needs to hand its parameters over; no desktop involved.
if (isCallbackPage()) {
  handleCallbackPage()
} else {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <Shell />
    </StrictMode>,
  )
}
