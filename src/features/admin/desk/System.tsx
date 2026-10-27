import { useMemo, useState } from 'react'
import { weekDelta, manilaDay } from './homeApi'
import { Card, join, useSource } from './Home'
import {
  dayRates, errorTotals, errorsByVersion, errorsNote, errorsTone, JOBS, jobStatus, loadClientErrors, loadJobRuns, loadKpis, loadPendingMigrations, loadPhones, lowestDay,
  phoneStatus, seenRate, seenTone, sortPhones, unseenList, type Pair
} from './systemApi'
import type { PageProps } from './types'
import { useDeskPeople } from './people'
import { Empty, Kpi, PageHead, Tag, type Tone } from './ui'
import './system.css'
import './files.css'

const WORD: Record<Tone, string> = { ok: 'OK', warn: 'Check', bad: 'Problem', plain: '' }
const dayLong = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-PH', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })

/** One status row: a dot, the name, what it means, and the state in words (a colour alone is never the message). */
function Line({ tone, name, note, right }: { tone: Tone; name: string; note?: string; right?: string }) {
  return (
    <li className="sy-ln">
      <span className={`sy-dot ${tone}`} aria-hidden="true" />
      <div className="sy-grow"><b>{name}</b>{note && <div className="sy-sub">{note}</div>}</div>
      {right && <span className={`sy-st ${tone}`}>{WORD[tone] && <span className="wa-sr">{WORD[tone]}: </span>}{right}</span>}
    </li>
  )
}

const WEEK_ROWS: { key: 'active_members' | 'screens' | 'doses_logged' | 'readings_logged' | 'client_errors'; label: string }[] = [
  { key: 'active_members', label: 'Members who opened the app' }, { key: 'screens', label: 'Screens opened' }, { key: 'doses_logged', label: 'Doses logged' },
  { key: 'readings_logged', label: 'Readings logged' }, { key: 'client_errors', label: 'App errors' }
]

export default function System(_: PageProps) {
  const [tick, setTick] = useState(0)
  const people = useDeskPeople()
  const kpis = useSource(loadKpis, tick)
  const phones = useSource(loadPhones, tick)
  const jobs = useSource(loadJobRuns, tick)
  const errs = useSource(() => loadClientErrors(), tick)
  const pending = useSource(loadPendingMigrations, tick)
  const busy = [kpis, phones, jobs, errs, pending].some((s) => s.loading)
  const now = Date.now()
  const today = manilaDay(now)

  const alerts = kpis.data?.alerts ?? null
  const rate = seenRate(alerts)
  const unseen = useMemo(() => unseenList(alerts), [alerts])
  const rates = useMemo(() => dayRates(alerts), [alerts])
  const low = lowestDay(rates)
  const rows = useMemo(() => sortPhones((phones.data ?? []).map((p) => ({
    ...p, ...phoneStatus(p, now), name: people.people?.find((x) => x.auth_user_id === p.user_id)?.display_name ?? 'Unknown phone'
  }))), [phones.data, people.people]) // eslint-disable-line react-hooks/exhaustive-deps
  const problems = rows.filter((r) => r.tone !== 'ok' && r.platform !== 'web') // the browser app never has alarms: listed, not counted
  const totals = useMemo(() => (errs.data ? errorTotals(errs.data, today) : null), [errs.data, today])
  const byVersion = useMemo(() => (errs.data ? errorsByVersion(errs.data, today) : null), [errs.data, today])
  const waiting = pending.data?.length ?? null

  return (
    <>
      <PageHead title="System health" sub="Is everything working for the family?"><button className="dk-b" onClick={() => setTick((t) => t + 1)} disabled={busy}>{busy ? 'Refreshing' : 'Refresh'}</button></PageHead>
      <div className="dk-grid">
        <div className="dk-s3"><Kpi label="Seen in the app" value={kpis.loading ? '...' : rate == null ? '-' : `${rate}%`}
          foot={kpis.loading ? undefined : alerts == null ? 'Not available yet' : rate == null ? 'No alert is old enough to judge yet' : `alerts opened within 1 hour, last 7 days, ${alerts.seen_1h} of ${alerts.due_1h}`}
          tone={seenTone(rate)} /></div>
        <div className="dk-s3"><Kpi label="Phone alarm problems" value={phones.loading ? '...' : phones.error ? '-' : problems.length}
          foot={problems.length ? problems.slice(0, 2).map((p) => p.name).join(', ') + (problems.length > 2 ? ` +${problems.length - 2}` : '') : phones.error || phones.loading ? undefined : 'Every Android phone checks out'}
          tone={problems.some((p) => p.tone === 'bad') ? 'bad' : problems.length ? 'warn' : 'plain'} /></div>
        <div className="dk-s3"><Kpi label="Errors today" value={errs.loading ? '...' : totals ? totals.today : '-'} foot={totals ? errorsNote(totals) : undefined} tone={totals ? errorsTone(totals) : 'plain'} /></div>
        <div className="dk-s3"><Kpi label="Update pending" value={pending.loading ? '...' : waiting == null ? '-' : waiting}
          foot={waiting == null ? undefined : waiting === 0 ? 'The database is up to date' : `${waiting} database ${waiting === 1 ? 'update' : 'updates'} waiting`} tone={waiting ? 'warn' : 'plain'} /></div>

        <Card id="sy-ph" title="Alarms per phone" cls="dk-s6" src={join(phones)}>
          {rows.length === 0 ? <div className="dk-card-b"><Empty>No phone has checked in yet. It appears after the member opens the new app.</Empty></div>
            : <ul className="sy-list">{rows.map((r) => <Line key={r.user_id} tone={r.tone} name={r.name} note={r.text} />)}</ul>}
        </Card>

        <Card id="sy-jobs" title="Scheduled jobs" cls="dk-s6" src={join(jobs)}>
          {jobs.data && <ul className="sy-list">{JOBS.map((j) => { const s = jobStatus(jobs.data![j.job], now, j.staleMin); return <Line key={j.job} tone={s.tone} name={j.label} note={j.every} right={s.text} /> })}</ul>}
        </Card>

        <Card id="sy-unseen" title="Alerts nobody opened, last 7 days" cls="dk-s4" src={join(kpis)}>
          {alerts == null ? <div className="dk-card-b"><Empty>Not available yet. It starts once the family alerts are switched on.</Empty></div>
            : unseen.length === 0 ? <div className="dk-card-b"><Empty>Every alert was opened.</Empty></div>
            : <ul className="sy-list">{unseen.map((u) => <Line key={u.kind} tone="plain" name={u.label} right={String(u.n)} />)}</ul>}
          <p className="sy-foot">The app shows alerts when someone opens it; there is no lock-screen push on the Android app.</p>
        </Card>

        <Card id="sy-err" title="App errors, last 7 days" cls="dk-s4" src={join(errs)}>
          {byVersion && byVersion.length === 0 ? <div className="dk-card-b"><Empty>No errors in the last 7 days.</Empty></div> : byVersion && (
            <div className="dk-scrollx"><table className="dk-table">
              <thead><tr><th scope="col">App version</th><th scope="col">Errors</th><th scope="col">Different</th></tr></thead>
              <tbody>{byVersion.map((v) => <tr key={v.version}><th scope="row">{v.version}</th><td>{v.errors}</td><td>{v.kinds}</td></tr>)}</tbody>
            </table></div>
          )}
        </Card>

        <Card id="sy-mig" title="Database updates waiting" cls="dk-s4" src={join(pending)}>
          {pending.data && (pending.data.length === 0 ? <div className="dk-card-b"><Empty>Nothing waiting.</Empty></div>
            : <div className="dk-card-b sy-tags">{pending.data.map((v) => <Tag key={v} tone="warn">{v}</Tag>)}</div>)}
        </Card>

        <Card id="sy-week" title="This week" cls="dk-s6" src={join(kpis)}>
          {kpis.data && (
            <div className="dk-scrollx"><table className="dk-table">
              <thead><tr><th scope="col">Last 7 days</th><th scope="col">Now</th><th scope="col">Before</th><th scope="col">Change</th></tr></thead>
              <tbody>{WEEK_ROWS.map((w) => { const p: Pair = kpis.data![w.key]; return <tr key={w.key}><th scope="row">{w.label}</th><td>{p.cur}</td><td>{p.prev}</td><td>{weekDelta(p.cur, p.prev)?.replace(' vs last week', '') ?? ''}</td></tr> })}</tbody>
            </table></div>
          )}
        </Card>

        <Card id="sy-spark" title="Alerts seen in the app, last 14 days" cls="dk-s6" src={join(kpis)}>
          {alerts == null ? <div className="dk-card-b"><Empty>Not available yet.</Empty></div> : rates.length === 0 ? <div className="dk-card-b"><Empty>No alerts in the last 14 days.</Empty></div> : (
            <div className="dk-card-b">
              <div className="sy-spark" role="img" aria-label={`Share of alerts opened within 1 hour, per day. ${low ? `Lowest ${dayLong(low.day)}, ${low.rate}%.` : ''}`}>
                {rates.map((r) => <i key={r.day} className={r.rate != null && r.rate < 80 ? 'b' : ''} style={{ height: `${r.rate ?? 0}%` }} title={`${dayLong(r.day)}: ${r.rate == null ? 'nothing to judge' : r.rate + '%'}`} />)}
              </div>
              {low && <p className={`sy-foot${low.rate < 80 ? ' bad' : ''}`}>Lowest: {dayLong(low.day)}, {low.rate}%</p>}
              <div className="wa-sr"><table><caption>Alerts opened within 1 hour, per day</caption><thead><tr><th scope="col">Day</th><th scope="col">Opened within 1 hour</th></tr></thead>
                <tbody>{rates.map((r) => <tr key={r.day}><th scope="row">{r.day}</th><td>{r.rate == null ? 'no alerts' : `${r.rate}%`}</td></tr>)}</tbody></table></div>
            </div>
          )}
        </Card>
      </div>
    </>
  )
}
