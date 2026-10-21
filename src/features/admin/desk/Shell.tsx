import { useEffect, useState, type ComponentType } from 'react'
import { supabase } from '../../auth/client'
import { Icon, type IconName } from '../../shell/Icon'
import { DESK_LABELS, DESK_PAGES, deskHref, parseDesk, type DeskPage, type PageProps } from './types'
import Members from './Members'
import People from './Person'
import Queue from './Queue'
import Records from './Records'
import Files from './Files'
import Ids from './Ids'
import Duplicates from './Duplicates'
import History from './History'
import './desk.css'

const PAGES: Record<DeskPage, ComponentType<PageProps>> = { members: Members, people: People, queue: Queue, records: Records, files: Files, ids: Ids, duplicates: Duplicates, history: History }
const ICONS: Record<DeskPage, IconName> = { members: 'users', people: 'heart', queue: 'check', records: 'file', files: 'scan', ids: 'key', duplicates: 'pdf', history: 'clock' }

/** Nav badges: drafts waiting and failed scans. Counts only. */
function useCounts() {
  const [c, setC] = useState<Partial<Record<DeskPage, number>>>({})
  useEffect(() => {
    if (!supabase) return
    void supabase.from('records_queue').select('drafts').then(({ data }) => {
      const n = (data ?? []).reduce((a, r: { drafts: number | null }) => a + (r.drafts ?? 0), 0)
      setC((x) => ({ ...x, queue: n }))
    })
    void supabase.from('source_files').select('id', { count: 'exact', head: true }).eq('ingest_status', 'failed').then(({ count }) => setC((x) => ({ ...x, files: count ?? 0 })))
  }, [])
  return c
}

export default function AdminDesk() {
  const at = parseDesk(location.hash) ?? { page: 'members' as DeskPage, id: null }
  const counts = useCounts()
  const Page = PAGES[at.page]
  useEffect(() => { document.title = `${DESK_LABELS[at.page]} - Admin - Family Bantay` }, [at.page])
  return (
    <div className="dk">
      <nav className="dk-nav" aria-label="Admin dashboard">
        <a className="dk-nav-a" href="#admin"><Icon name="home" /><span>Overview</span></a>
        {DESK_PAGES.map((p) => (
          <a key={p} className="dk-nav-a" href={deskHref(p)} aria-current={p === at.page ? 'page' : undefined}>
            <Icon name={ICONS[p]} active={p === at.page} /><span>{DESK_LABELS[p]}</span>
            {!!counts[p] && <b className="dk-count" aria-label={`${counts[p]} waiting`}>{counts[p]}</b>}
          </a>
        ))}
      </nav>
      <div className="dk-main"><Page key={at.page} id={at.id} /></div>
    </div>
  )
}
