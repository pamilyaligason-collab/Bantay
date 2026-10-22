import { useMemo, useRef, useState, type ReactNode } from 'react'
import { useDialog } from '../../docs/useDialog'
import { Icon } from '../../shell/Icon'

// Shared dashboard pieces. Pages build on these so every page looks and behaves the same.

/** Page title row. `crumbs` are the parent pages ([label, href]); the title is the last crumb. */
export function PageHead({ title, sub, crumbs, children }: { title: string; sub?: string; crumbs?: [string, string][]; children?: ReactNode }) {
  return (
    <header className="dk-head">
      <div className="dk-grow">
        {crumbs?.length ? <nav className="dk-crumbs" aria-label="Breadcrumb">{crumbs.map(([l, h]) => <span key={h}><a href={h}>{l}</a> / </span>)}</nav> : null}
        <h1>{title}</h1>{sub && <p className="dk-sub">{sub}</p>}
      </div>
      {children && <div className="dk-acts">{children}</div>}
    </header>
  )
}

/** Filter bar above a table: put chips, selects and a search input inside. */
export const Filters = ({ children }: { children: ReactNode }) => <div className="dk-filters" role="search">{children}</div>

export type Tone = 'ok' | 'warn' | 'bad' | 'plain'
export const Tag = ({ tone = 'plain', children }: { tone?: Tone; children: ReactNode }) => <span className={`dk-tag ${tone}`}>{children}</span>
export const statusTone = (s: string | null | undefined): Tone => (s === 'confirmed' ? 'ok' : s === 'draft' ? 'warn' : s === 'rejected' ? 'bad' : 'plain')

/** Right-hand detail panel (desktop), side sheet (tablet), full screen (phone). */
export function Panel({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const { ref, onKeyDown } = useDialog(onClose)
  return (
    <aside className="dk-panel" ref={ref} onKeyDown={onKeyDown} role="dialog" aria-label={title}>
      <div className="dk-panel-head"><h2 className="h2 dk-grow">{title}</h2><button className="dk-b" onClick={onClose}>Close</button></div>
      <div className="dk-panel-body">{children}</div>
    </aside>
  )
}

export const Empty = ({ children }: { children: ReactNode }) => <p className="dk-empty">{children}</p>

/** Confirm step for every destructive or bulk action. Returns the dialog node and `ask(text, run)`. */
export type ConfirmOpts = { title?: string; verb?: string; danger?: boolean }
export function useConfirm() {
  const [pending, setPending] = useState<({ text: string; run: () => Promise<void> } & ConfirmOpts) | null>(null)
  const [busy, setBusy] = useState(false)
  const close = () => { if (!busy) setPending(null) }
  const go = async () => { if (!pending) return; setBusy(true); try { await pending.run() } finally { setBusy(false); setPending(null) } }
  const node = pending && <ConfirmDialog {...pending} busy={busy} onCancel={close} onGo={go} />
  return { node, ask: (text: string, run: () => Promise<void>, opts?: ConfirmOpts) => setPending({ text, run, ...opts }) }
}

/** Shared confirm dialog. `title` adds a heading, `verb` names the action button, `danger` makes it red (Archive, Reject, Delete). */
export function ConfirmDialog({ text, title, verb = 'Confirm', danger, busy = false, onCancel, onGo }: ConfirmOpts & { text: string; busy?: boolean; onCancel: () => void; onGo: () => void }) {
  const { ref, onKeyDown } = useDialog(onCancel)
  return (
    <div className="dk-scrim">
      <div className="dk-confirm" role="alertdialog" aria-modal="true" aria-labelledby={title ? 'dk-confirm-title' : undefined} aria-describedby="dk-confirm-text" ref={ref} onKeyDown={onKeyDown}>
        {title && <h2 id="dk-confirm-title" className="h2">{title}</h2>}
        <p id="dk-confirm-text">{text}</p>
        <div className="dk-acts"><button className="dk-b" onClick={onCancel} disabled={busy} data-autofocus>Cancel</button><button className={`dk-b ${danger ? 'bad-solid' : 'go'}`} onClick={onGo} disabled={busy}>{verb}</button></div>
      </div>
    </div>
  )
}

/** Sticky bar for bulk actions. Shows only while `count` > 0; put the action buttons inside. */
export function BulkBar({ count, noun = 'selected', children }: { count: number; noun?: string; children: ReactNode }) {
  if (count < 1) return null
  return <div className="dk-bulk" role="region" aria-label="Bulk actions"><b>{count} {noun}</b><div className="dk-acts">{children}</div></div>
}

/** Status line with an optional Undo, e.g. after confirm/reject. Undo restores the previous status. */
export function useToast() {
  const [t, setT] = useState<{ text: string; undo?: () => void } | null>(null)
  const timer = useRef<number>(undefined)
  const show = (text: string, undo?: () => void) => { window.clearTimeout(timer.current); setT({ text, undo }); timer.current = window.setTimeout(() => setT(null), 8000) }
  const node = (
    <div className="dk-toast" role="status" aria-live="polite">
      {t && <>{t.text}{t.undo && <button className="dk-b" onClick={() => { t.undo?.(); setT(null) }}>Undo</button>}</>}
    </div>
  )
  return { node, show }
}

/** Number tile for the dashboard. `tone` colours it only when something needs action (audit: a red tile at 0 reads as an alarm). */
export function Kpi({ label, value, foot, href, tone = 'plain' }: { label: string; value: ReactNode; foot?: ReactNode; href?: string; tone?: Tone }) {
  const body = <><span className="dk-kpi-l">{label}</span><span className="dk-kpi-v">{value}</span>{foot && <span className="dk-kpi-f">{foot}</span>}</>
  return href ? <a className={`dk-kpi ${tone}`} href={href}>{body}</a> : <div className={`dk-kpi ${tone}`}>{body}</div>
}

/** Grey placeholder rows while a table loads. */
export const Skeleton = ({ rows = 5 }: { rows?: number }) => (
  <div className="dk-skel" aria-busy="true" aria-label="Loading">{Array.from({ length: rows }, (_, i) => <i key={i} />)}</div>
)

/** Client-side sorting for small tables. `get` maps a row to the value of a column key. */
export function useSort<T>(rows: T[] | null | undefined, get: (r: T, key: string) => string | number | null | undefined, initial?: { key: string; dir: 1 | -1 }) {
  const [by, setBy] = useState(initial ?? null)
  const sorted = useMemo(() => {
    if (!rows || !by) return rows ?? []
    const v = (r: T) => get(r, by.key)
    return [...rows].sort((a, b) => {
      const x = v(a), y = v(b)
      if (x == null || x === '') return 1 // blanks last either way
      if (y == null || y === '') return -1
      return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))) * by.dir
    })
  }, [rows, by]) // eslint-disable-line react-hooks/exhaustive-deps
  const toggle = (key: string) => setBy((b) => (b?.key === key ? { key, dir: b.dir === 1 ? -1 : 1 } : { key, dir: 1 }))
  return { sorted, by, toggle }
}

/** Sortable column header: a button inside <th> with aria-sort. */
export function SortTh({ k, label, sort }: { k: string; label: string; sort: { by: { key: string; dir: 1 | -1 } | null; toggle: (k: string) => void } }) {
  const on = sort.by?.key === k
  return (
    <th scope="col" aria-sort={on ? (sort.by!.dir === 1 ? 'ascending' : 'descending') : 'none'}>
      <button className="dk-sort" onClick={() => sort.toggle(k)}>{label}<span className={`dk-sort-i${on ? ` on${sort.by!.dir === -1 ? ' desc' : ''}` : ''}`} aria-hidden="true"><Icon name="chev" size={14} /></span></button>
    </th>
  )
}
