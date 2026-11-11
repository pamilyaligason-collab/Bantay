import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Icon, type IconName } from '../shell/Icon'
import { SubHeader } from '../shell/SubHeader'
import { useKv } from '../shell/useKv'
import { getJob, useJob } from '../update/job'
import { AppUpdater } from '../update/plugin'
import { checkForUpdate, useUpdate } from '../update/useUpdate'
import { act as run, type Ctx } from './all/actions'
import { readFacts } from './all/facts'
import { allSet, buildRows, doAllLeft, rowsLeft, walk, type Facts, type Row, type RowId } from './all/rows'
import { updateFact } from './all/updateFact'
import { onResume } from './steps'
import '../shell/shell.css'
import './all/all.css'

const ICON: Record<RowId, IconName> = { update: 'dl', notifications: 'bell', exact: 'clock', battery: 'bolt', autostart: 'bolt', bg: 'bell', location: 'pin', health: 'heart', library: 'cross', maps: 'map', test: 'send' }

/** Set up everything (#setup/all): one ordered list. Each row says what the phone will ask and has one button; Do all walks them in order and stops at each prompt. */
export default function AllScreen() {
  const u = useUpdate()
  const job = useJob()
  const [wifiOnly, , wifiRead] = useKv<boolean>('update.wifiOnly', true)
  const [base, setBase] = useState<Omit<Facts, 'update'> | null>(null)
  const [canInstall, setCanInstall] = useState<boolean | null>(null)
  const [busy, setBusy] = useState<RowId | 'all' | null>(null)
  const [note, setNote] = useState('')
  const alive = useRef(true)
  const autoStarted = useRef(false)

  const refresh = useCallback(async () => {
    const [b, info] = await Promise.all([readFacts(), AppUpdater.info().catch(() => null)])
    if (!alive.current) return
    setBase(b)
    setCanInstall(info?.versionCode ? info.canInstall : null)
  }, [])
  useEffect(() => {
    alive.current = true
    void checkForUpdate(true).then(refresh)
    const off = onResume(() => { void refresh() })
    return () => { alive.current = false; off() }
  }, [refresh])

  const update = useMemo(() => updateFact(u, job, canInstall), [u, job, canInstall])
  const facts: Facts | null = useMemo(() => (base ? { ...base, update } : null), [base, update])
  const rows = useMemo(() => (facts ? buildRows(facts) : []), [facts])
  const latest = u.decision.kind === 'none' ? null : u.decision.latest
  const ctx: Ctx | null = base ? { native: base.native, location: base.location, latest, canInstall, wifiOnly } : null

  // Opening this screen is the go-ahead for the update: the download starts by itself once Android allows installs; the install itself is Android's one tap.
  useEffect(() => {
    if (autoStarted.current || !wifiRead || !latest || canInstall !== true || job.phase !== 'idle') return
    autoStarted.current = true
    void run('update', { native: true, location: 'ask', latest, canInstall, wifiOnly })
  }, [latest, canInstall, job.phase, wifiOnly, wifiRead])

  const step = async (id: RowId) => {
    if (!ctx) return
    setBusy(id); setNote('')
    await run(id, ctx)
    await refresh()
    if (alive.current) setBusy(null)
  }
  // Do all re-reads after each step through the same builder, so "done" means what the list shows.
  const doAll = async () => {
    if (!ctx || !base) return
    setBusy('all'); setNote('')
    let last = rows
    const read = async () => {
      const [b, info] = await Promise.all([readFacts(), AppUpdater.info().catch(() => null)])
      setBase(b)
      const ci = info?.versionCode ? info.canInstall : null
      setCanInstall(ci)
      last = buildRows({ ...b, update: updateFact(u, getJob(), ci) })
      return last
    }
    const stoppedAt = await walk(rows, read, (id) => run(id, ctx))
    if (!alive.current) return
    setBusy(null)
    const t = stoppedAt && rows.find((r) => r.id === stoppedAt)?.title
    const mine = rowsLeft(last).filter((r) => r.manual).map((r) => r.title)
    if (t) setNote(`Waiting on "${t}". Finish it on your phone, then tap Do all again.`)
    else if (mine.length) setNote(`Left for you: ${mine.join(' and ')}. Do all never starts those; tap their own button when you want them.`)
  }

  const left = rowsLeft(rows).length
  const done = allSet(rows)
  const mineLeft = rowsLeft(rows).filter((r) => r.manual).map((r) => r.title)
  const web = base ? !base.native : false

  return (
    <div className="sh sh-me sa" data-testid="setup-all">
      <SubHeader title="Set up everything" backHref="#me/phone" backLabel="Back to Phone" />
      {!facts ? <p className="sh-sub" role="status">Looking at this phone.</p> : (
        <>
          <div className="sh-card sa-sum" role="status" aria-live="polite" data-state={done ? 'all-set' : 'left'}>
            <span className="sa-ic" data-on={done}><Icon name={done ? 'check' : 'gear'} size={24} /></span>
            <div>
              <b>{done ? 'All set' : `${left} ${left === 1 ? 'step' : 'steps'} left`}</b>
              <div className="sa-say">{done ? 'Bantay is ready on this phone.' : `Each step says what your phone will ask. Nothing is switched on without your tap.${mineLeft.length ? ` Do all leaves ${mineLeft.join(' and ')} for your own tap.` : ''}`}</div>
            </div>
          </div>
          {doAllLeft(rows).length > 0 && (
            <button type="button" className="sa-btn sa-primary" data-testid="do-all" disabled={busy !== null} onClick={() => void doAll()}>
              {busy === 'all' ? 'Working. Answer your phone.' : 'Do all'}
            </button>
          )}
          {note && <p className="sa-say" role="status">{note}</p>}
          <ol className="sh-card sa-list" aria-label="Setup steps">
            {rows.map((r) => <RowView key={r.id} row={r} busy={busy !== null} working={busy === r.id} onTap={() => void step(r.id)} />)}
          </ol>
          {web && <p className="sa-say">In this browser only some steps apply. The Android app does the rest. <a href="/get/">Get the Android app</a></p>}
        </>
      )}
    </div>
  )
}

function RowView({ row, busy, working, onTap }: { row: Row; busy: boolean; working: boolean; onTap: () => void }) {
  const showBtn = row.status === 'tap' || (row.status === 'done' && (row.id === 'test' || row.id === 'autostart'))
  return (
    <li className="sa-row" data-row={row.id} data-status={row.status}>
      <span className="sa-ic" data-on={row.status === 'done'}><Icon name={row.status === 'done' ? 'check' : ICON[row.id]} size={20} /></span>
      <div className="sa-body">
        <b>{row.title}<span className="sa-tag" data-status={row.status}>{row.status === 'done' ? 'Done' : row.status === 'na' ? 'Not on this phone' : 'Needs one tap'}</span></b>
        <div className="sa-say">{row.say}</div>
        {showBtn && (
          <button type="button" className="sa-btn" disabled={busy || row.disabled} aria-label={`${row.title}: ${row.button}`} onClick={onTap}>
            {working ? 'Working' : row.button}
          </button>
        )}
      </div>
    </li>
  )
}
