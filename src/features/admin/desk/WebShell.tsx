import { useEffect, useRef, useState, type ComponentType } from 'react'
import { supabase } from '../../auth/client'
import { getMember, onAuthChange, signOut } from '../../auth/session'
import { Icon, type IconName } from '../../shell/Icon'
import { listPinRequests } from '../api'
import { db } from '../../../db'
import { applyTheme, THEME_KEY, useSavedTheme, type ThemePref } from '../../shell/theme'
import { useDeskPeople } from './people'
import { DESK_GROUPS, DESK_LABELS, deskHref, parseDesk, type DeskPage, type PageProps } from './types'
import Home from './Home'
import Members from './Members'
import Calendar from './Calendar'
import Queue from './Queue'
import Records from './Records'
import Duplicates from './Duplicates'
import Files from './Files'
import Ids from './Ids'
import History from './History'
import System from './System'
import Sharing from './Sharing'
import { loadSystemBadge } from './systemApi'
import './desk.css'

const PAGES: Record<DeskPage, ComponentType<PageProps>> = { home: Home, members: Members, calendar: Calendar, queue: Queue, records: Records, duplicates: Duplicates, files: Files, ids: Ids, history: History, system: System, sharing: Sharing }
const ICONS: Record<DeskPage, IconName> = { home: 'home', members: 'users', calendar: 'calendar', queue: 'check', records: 'file', duplicates: 'pdf', files: 'scan', ids: 'key', history: 'clock', system: 'gauge', sharing: 'lock' }
/** g + key jumps to a page (help sheet lists them). */
export const JUMPS: Record<string, DeskPage> = { h: 'home', m: 'members', c: 'calendar', q: 'queue', r: 'records', d: 'duplicates', f: 'files', i: 'ids', y: 'history', s: 'system', w: 'sharing' }
const NAV_KEY = 'admin.nav.collapsed'

const typing = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))

/** Sidebar badges: drafts waiting, duplicate-free failed scans. Counts only. */
function useCounts() {
  const [c, setC] = useState<Partial<Record<DeskPage, number>>>({})
  useEffect(() => {
    if (!supabase) return
    void supabase.from('records_queue').select('drafts').then(({ data }) => {
      setC((x) => ({ ...x, queue: (data ?? []).reduce((a, r: { drafts: number | null }) => a + (r.drafts ?? 0), 0) }))
    })
    void supabase.from('source_files').select('id', { count: 'exact', head: true }).eq('ingest_status', 'failed').then(({ count }) => setC((x) => ({ ...x, files: count ?? 0 })))
    void loadSystemBadge().then((r) => { if (r.ok) setC((x) => ({ ...x, system: r.data })) }) // red scheduled jobs; the dot stays off when unknown
  }, [])
  return c
}

/** Top-bar search: people by name, papers by title or facility. Enter opens the first hit. */
function Search() {
  const { people } = useDeskPeople()
  const [q, setQ] = useState('')
  const [papers, setPapers] = useState<{ id: string; person_id: string; title: string | null; facility: string | null }[]>([])
  const box = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const on = (e: KeyboardEvent) => { if (e.key === '/' && !typing(e.target)) { e.preventDefault(); box.current?.focus() } }
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [])
  useEffect(() => {
    const t = q.trim()
    if (!supabase || t.length < 2) { setPapers([]); return }
    const like = `%${t.replace(/[%_,()]/g, ' ')}%` // PostgREST or() syntax: strip characters it treats as separators
    const h = window.setTimeout(() => {
      void supabase!.from('documents').select('id, person_id, title, facility').neq('status', 'rejected')
        .or(`title.ilike.${like},facility.ilike.${like}`).limit(6).then(({ data }) => setPapers(data ?? []))
    }, 250)
    return () => window.clearTimeout(h)
  }, [q])
  const t = q.trim().toLowerCase()
  const hits = [
    ...(t ? (people ?? []).filter((p) => p.display_name.toLowerCase().includes(t)).slice(0, 6).map((p) => ({ key: 'p' + p.id, label: p.display_name, kind: 'Member', href: deskHref('members', p.id) })) : []),
    ...papers.map((d) => ({ key: 'd' + d.id, label: d.title || d.facility || 'Paper', kind: 'Paper', href: deskHref('records', d.person_id, 'papers') }))
  ]
  const go = (href: string) => { location.hash = href; setQ(''); box.current?.blur() }
  return (
    <div className="wa-search" role="search">
      <label htmlFor="wa-q" className="wa-sr">Search members and papers</label>
      <Icon name="search" size={18} />
      <input id="wa-q" ref={box} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search members, papers ( / )" autoComplete="off"
        role="combobox" aria-expanded={hits.length > 0} aria-controls="wa-hits"
        onKeyDown={(e) => { if (e.key === 'Enter' && hits[0]) go(hits[0].href); if (e.key === 'Escape') { setQ(''); box.current?.blur() } }} />
      {hits.length > 0 && (
        <ul id="wa-hits" className="wa-hits" role="listbox">
          {hits.map((h) => <li key={h.key} role="option" aria-selected={false}><a href={h.href} onClick={() => setQ('')}><span>{h.label}</span><em>{h.kind}</em></a></li>)}
        </ul>
      )}
    </div>
  )
}

function Help({ close }: { close: () => void }) {
  return (
    <div className="dk-scrim" onClick={close}>
      <div className="dk-confirm" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.key === 'Escape' && close()}>
        <h2 className="h2">Keyboard shortcuts</h2>
        <table className="dk-table"><tbody>
          <tr><th scope="row"><kbd>/</kbd></th><td>Search</td></tr>
          <tr><th scope="row"><kbd>?</kbd></th><td>This list</td></tr>
          {Object.entries(JUMPS).map(([k, p]) => <tr key={k}><th scope="row"><kbd>g</kbd> <kbd>{k}</kbd></th><td>{DESK_LABELS[p]}</td></tr>)}
          <tr><th scope="row"><kbd>j</kbd> <kbd>k</kbd> <kbd>x</kbd> <kbd>c</kbd></th><td>Confirm queue: move, tick, confirm</td></tr>
        </tbody></table>
        <div className="dk-acts"><button className="dk-b go" onClick={close} autoFocus>Close</button></div>
      </div>
    </div>
  )
}

const NEXT_THEME: Record<ThemePref, ThemePref> = { system: 'light', light: 'dark', dark: 'system' }
const THEME_ICON: Record<ThemePref, IconName> = { system: 'screen', light: 'sun', dark: 'moon' }
const THEME_LABEL: Record<ThemePref, string> = { system: 'Theme: same as this computer', light: 'Theme: light', dark: 'Theme: dark' }

/** Light / dark / system, saved where the app keeps it (same browser = same choice). */
function ThemeButton({ item }: { item?: boolean }) {
  useSavedTheme()
  const [t, setT] = useState<ThemePref>('system')
  useEffect(() => { void db.kv.get(THEME_KEY).then((r) => setT(r?.value === 'light' || r?.value === 'dark' ? r.value : 'system'), () => undefined) }, [])
  const next = () => {
    const n = NEXT_THEME[t]
    setT(n); applyTheme(n)
    void db.kv.put({ key: THEME_KEY, value: n }).catch(() => undefined) // not saved in a private window; still applied now
  }
  if (item) return <button className="wa-theme" onClick={next}><Icon name={THEME_ICON[t]} size={20} />&nbsp;{THEME_LABEL[t]}</button> // phone: the top-bar button is hidden, so the account menu carries it
  return <button className="wa-ib" onClick={next} aria-label={`${THEME_LABEL[t]}. Change theme`} title={THEME_LABEL[t]}><Icon name={THEME_ICON[t]} /></button>
}

/** Branded placeholder while the role check runs; admin-main also passes it as the sign-in check fallback. */
export function ShellSkeleton() {
  return (
    <div className="wa wa-skel" aria-busy="true" role="status" aria-label="Loading">
      <header className="wa-top"><span className="wa-brand"><Icon name="shield" /><span>Bantay Admin</span></span></header>
      <div className="wa-side" aria-hidden="true" />
      <main className="wa-main"><div className="wa-skel-row" aria-hidden="true"><i /><i /><i /><i /></div></main>
    </div>
  )
}

export default function WebShell() {
  const [admin, setAdmin] = useState<'checking' | 'yes' | 'no'>('checking')
  const [name, setName] = useState('')
  const [at, setAt] = useState(() => parseDesk(location.hash))
  const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem(NAV_KEY) === '1' } catch { return false } })
  const [menu, setMenu] = useState(false) // small screens: sidebar drawer
  const [help, setHelp] = useState(false)
  const [pins, setPins] = useState(0)
  const counts = useCounts()
  const main = useRef<HTMLElement>(null)

  useEffect(() => {
    const check = () => void getMember().then((m) => { setAdmin(m?.role === 'admin' ? 'yes' : 'no'); setName(m?.handle ?? '') }, () => setAdmin('no'))
    check()
    return onAuthChange(check)
  }, [])
  useEffect(() => { if (admin === 'yes') void listPinRequests().then((r) => r.ok && setPins(r.data.length)) }, [admin])
  useEffect(() => {
    const on = () => { setAt(parseDesk(location.hash)); setMenu(false); main.current?.focus({ preventScroll: true }) }
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  useEffect(() => { document.title = `${DESK_LABELS[at.page]} - Bantay Admin` }, [at.page])
  useEffect(() => {
    let g = false
    const on = (e: KeyboardEvent) => {
      if (typing(e.target) || e.ctrlKey || e.metaKey || e.altKey) return
      if (e.key === '?') { setHelp(true); return }
      if (g && JUMPS[e.key]) { location.hash = deskHref(JUMPS[e.key]); g = false; return }
      g = e.key === 'g'
    }
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [])
  const toggle = () => setCollapsed((c) => { try { localStorage.setItem(NAV_KEY, c ? '0' : '1') } catch { /* private mode: not remembered */ } return !c })

  if (admin === 'checking') return <ShellSkeleton />
  if (admin === 'no') return (
    <div className="wa-gate"><h1>Admins only</h1><p>This page is for the family admin.</p><a className="dk-b go" href="/">Open Family Bantay</a></div>
  )
  const Page = PAGES[at.page]
  return (
    <div className={`wa${collapsed ? ' wa-collapsed' : ''}${menu ? ' wa-menu' : ''}`}>
      <a className="wa-skip" href="#wa-main" onClick={(e) => { e.preventDefault(); main.current?.focus() }}>Skip to content</a>
      <header className="wa-top">
        <button className="wa-ib wa-burger" aria-label="Menu" aria-expanded={menu} onClick={() => setMenu((m) => !m)}><Icon name="menu" /></button>
        <a className="wa-brand wa-hide-sm" href={deskHref('home')} aria-label="Bantay Admin, dashboard"><Icon name="shield" /><span>Bantay Admin</span></a>
        <Search />
        <a className="wa-ib" href={deskHref('members')} aria-label={`${pins} PIN reset requests`}><Icon name="key" />{pins > 0 && <b>{pins}</b>}</a>
        <span className="wa-hide-sm"><ThemeButton /></span>
        <button className="wa-ib wa-hide-sm" aria-label="Keyboard shortcuts" onClick={() => setHelp(true)}><Icon name="info" /></button>
        <details className="wa-me">
          <summary aria-label={`Account: ${name || 'Admin'}`}><span className="wa-av" aria-hidden="true">{(name || 'A').slice(0, 1).toUpperCase()}</span><span className="wa-name">{name || 'Admin'}</span></summary>
          <div className="wa-pop"><ThemeButton item />
          <a href="/">Open the family app</a><a href="/#admin">Phone admin tools</a><button onClick={() => void signOut().then(() => location.assign('/'))}>Sign out</button></div>
        </details>
      </header>
      <nav className="wa-side" aria-label="Admin pages">
        {DESK_GROUPS.map((g) => (
          <div key={g.label} className="wa-grp">
            <p className="wa-grp-l">{g.label}</p>
            {g.pages.map((p) => (
              <a key={p} className="wa-nav" href={deskHref(p)} aria-current={p === at.page ? 'page' : undefined} title={DESK_LABELS[p]}>
                <Icon name={ICONS[p]} active={p === at.page} size={20} /><span>{DESK_LABELS[p]}</span>
                {!!counts[p] && <b className={`wa-cnt ${p === 'files' || p === 'system' ? 'bad' : 'warn'}`} aria-label={p === 'system' ? `${counts[p]} jobs failing` : `${counts[p]} waiting`}>{counts[p]}</b>}
              </a>
            ))}
          </div>
        ))}
        <button className="wa-nav wa-fold" onClick={toggle} aria-pressed={collapsed}><Icon name={collapsed ? 'chev' : 'back'} size={20} /><span>{collapsed ? 'Expand' : 'Collapse'}</span></button>
      </nav>
      {menu && <button className="wa-shade" aria-label="Close menu" onClick={() => setMenu(false)} />}
      <main id="wa-main" className="wa-main" ref={main} tabIndex={-1}>
        <Page key={at.page} id={at.id} sub={at.sub} />
        <footer className="wa-foot">Family Bantay admin · counts only on the dashboard, health values stay in Records</footer>
      </main>
      {help && <Help close={() => setHelp(false)} />}
    </div>
  )
}
