// Test page for the e2e spec only (built when DOCS_HARNESS=1, see vite.config.ts; not part of the app).
// Stands in for the App.tsx route: DocsScreen inside the real shell classes, with a Supabase client pointed at a fake host.
import { createClient } from '@supabase/supabase-js'
import { createRoot } from 'react-dom/client'
import '../../styles/tokens.css'
import '../../styles/app.css'
import '../../styles/glass.css'
import { DocsScreen } from './DocsScreen'

const client = createClient('https://docs.supabase.test', 'pk-harness', { auth: { storageKey: 'docs-harness-auth', persistSession: true, autoRefreshToken: false } })
createRoot(document.getElementById('root')!).render(
  <div className="bt">
    <main className="scroll"><DocsScreen client={client} /></main>
  </div>
)
