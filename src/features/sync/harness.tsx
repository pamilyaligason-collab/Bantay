// Test page for the e2e spec only. It is built when SYNC_HARNESS=1 (see vite.config.ts) and is not part of the app.
// It stands in for main.tsx wiring: startSync + <SyncStatus/>, with the token taken from localStorage.
import { createRoot } from 'react-dom/client'
import { db, enqueue } from '../../db'
import '../../styles/tokens.css'
import '../../styles/app.css'
import { SyncStatus } from './SyncStatus'
import { startSync, syncNow } from './sync'

Object.assign(window, { __bantay: { db, enqueue, syncNow } })
startSync({
  url: 'https://harness.supabase.test',
  key: 'pk-harness',
  getToken: async () => localStorage.getItem('harness.token')
})
createRoot(document.getElementById('root')!).render(
  <>
    <h1>Sync</h1>
    <SyncStatus />
  </>
)
