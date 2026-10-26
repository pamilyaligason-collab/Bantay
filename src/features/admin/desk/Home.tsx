import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { dateTime, statusLabel } from '../shared'
import ScheduleCard from './ScheduleCard'
import {
  actionTone, ago, fieldsText, kindWord, loadActiveWeeks, loadConfirmedWeeks, loadDupeCount, loadExpiring, loadFailedScans, loadPeopleState, loadPins, loadQueue, loadRecent,
  loadUsageSeries, needsYou, queueSummary, summarize, toneIf, weekDelta, type Res
} from './homeApi'
import { deskHref, type PageProps } from './types'
import { tableWords } from './logsApi'
import { Empty, Kpi, PageHead, Skeleton, Tag } from './ui'
import { useDeskPeople } from './people'
import './home.css'
import './files.css' // dk-cardtab: tables become cards on a phone

type Src<T> = { data: T | null; loading: boolean; error: boolean; retry: () => void }

/** One card's data. `tick` (the Refresh button) reloads it; `retry` reloads just this one. */
function useSource<T>(load: () => Promise<Res<T>>, tick: number): Src<T> {
  const [s, set] = useState<{ data: T | null; loading: boolean; error: boolean }>({ data: null, loading: true, error: false })
  const [n, setN] = useState(0)
  useEffect(() => {
    let on = true
    set((p) => ({ ...p, loading: true, error: false }))
    load().then((r) => { if (on) set(r.ok ? { data: r.data, loading: false, error: false } : { data: null, loading: false, error: true }) }, () => { if (on) set({ data: null, loading: false, error: true }) })
    return () => { on = false }
  }, [tick, n]) // eslint-disable-line react-hooks/exhaustive-deps
  return { ...s, retry: () => setN((x) => x + 1) }
}

const join = (...a: Src<unknown>[]) => ({ loading: a.some((x) => x.loading), error: a.some((x) => x.error), retry: () => a.forEach((x) => x.error && x.retry()) })

function Card({ id, title, cls, link, src, children }: { id: string; title: string; cls: string; link?: [string, string]; src: { loading: boolean; error: boolean; retry: () => void }; children: ReactNode }) {
  return (
    <section className={`dk-card ${cls}`} aria-labelledby={id}>
      <div className="dk-card-h"><h2 id={id}>{title}</h2>{link && <a href={link[1]}>{link[0]}</a>}</div>
      {src.loading ? <Skeleton rows={3} /> : src.error
        ? <div className="dk-card-b hm-fail"><span>Could not load.</span><button className="dk-b" onClick={src.retry}>Retry</button></div>
        : children}
    </section>
  )
}

const num = (s: Src<number>) => (s.loading ? '...' : s.error || s.data == null ? '-' : s.data)

type Series = { days: string[]; values: number[] }
/** Inline SVG chart on tokens. The text summary and a hidden table carry the same numbers for screen readers. */
/** Pixel width of an element, so chart text is drawn 1:1 and never shrinks with the screen. Falls back to 640 where ResizeObserver is missing (tests). */
function useWidth(ref: React.RefObject<HTMLElement | null>) {
  const [w, setW] = useState(640)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([e]) => { const x = Math.round(e.contentRect.width); if (x > 0) setW(Math.max(260, x)) })
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
  return w
}

function Chart({ title, series, bars, weekly, unit }: { title: string; series: Series; bars?: boolean; weekly?: boolean; unit: string }) {
  const { days, values } = series
  const summary = summarize(values, days, weekly)
  const box = useRef<HTMLDivElement>(null)
  const W = useWidth(box), H = 180, L = 34, B = 26, T = 8
  const max = Math.max(1, ...values), top = max <= 4 ? 4 : Math.ceil(max / 10) * 10
  const bw = Math.max(8, Math.min(30, ((W - L - 8) / Math.max(1, values.length)) * 0.6)), pad = bars ? bw / 2 : 0 // bars stay inside the plot
  const x = (i: number) => L + pad + (values.length < 2 ? 0 : (i * (W - L - 8 - 2 * pad)) / (values.length - 1))
  const y = (v: number) => T + (1 - v / top) * (H - T - B)
  const short = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-PH', { day: 'numeric', month: 'short', timeZone: 'UTC' })
  const ticks = [0, Math.floor((days.length - 1) / 2), days.length - 1]
  return (
    <div className="hm-chart" ref={box}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}. ${summary}`}>
        {[0, top / 2, top].map((v) => <g key={v}><line x1={L} x2={W - 8} y1={y(v)} y2={y(v)} className="hm-grid" /><text x={L - 6} y={y(v) + 4} textAnchor="end" className="hm-axis">{Math.round(v)}</text></g>)}
        {bars
          ? values.map((v, i) => <rect key={days[i]} x={x(i) - bw / 2} y={y(v)} width={bw} height={Math.max(0, H - B - y(v))} rx={2} className="hm-bar" />)
          : <><polyline points={values.map((v, i) => `${x(i)},${y(v)}`).join(' ')} className="hm-line" />{values.map((v, i) => <circle key={days[i]} cx={x(i)} cy={y(v)} r={2} className="hm-dot" />)}</>}
        {ticks.map((i) => <text key={i} x={Math.min(Math.max(x(i), L + 14), W - 22)} y={H - 8} textAnchor="middle" className="hm-axis">{short(days[i])}</text>)}
      </svg>
      <p className="hm-sum">{summary}</p>
      <div className="wa-sr"><table>
        <caption>{title}</caption>
        <thead><tr><th scope="col">{weekly ? 'Week starting' : 'Day'}</th><th scope="col">{unit}</th></tr></thead>
        <tbody>{days.map((d, i) => <tr key={d}><th scope="row">{d}</th><td>{values[i]}</td></tr>)}</tbody>
      </table></div>
    </div>
  )
}

export default function Home(_: PageProps) {
  const [tick, setTick] = useState(0)
  const people = useDeskPeople()
  const ppl = useSource(loadPeopleState, tick)
  const queue = useSource(loadQueue, tick)
  const failed = useSource(loadFailedScans, tick)
  const expiring = useSource(() => loadExpiring(), tick)
  const dupes = useSource(loadDupeCount, tick)
  const pins = useSource(loadPins, tick)
  const usage = useSource(() => loadUsageSeries(), tick)
  const weeks = useSource(() => loadConfirmedWeeks(), tick)
  const activeWk = useSource(() => loadActiveWeeks(), tick)
  const recent = useSource(loadRecent, tick)

  const q = useMemo(() => (queue.data ? queueSummary(queue.data) : null), [queue.data])
  const busy = [ppl, queue, failed, expiring, dupes, pins, usage, weeks, recent, activeWk].some((s) => s.loading)
  const needs = useMemo(() => needsYou({ pins: pins.data ?? [], personOf: (u) => ppl.data?.personOf[u] ?? null, dupes: dupes.data, failed: failed.data, locked: ppl.data?.locked ?? [] }), [pins.data, ppl.data, dupes.data, failed.data])
  const needsSrc = join(pins, dupes, failed, ppl)
  const who = (actor: string | null) => (actor ? people.people?.find((p) => p.auth_user_id === actor)?.display_name ?? 'Unknown' : 'System')
  const now = Date.now()
  // Deltas count only members who can sign in; if either week is unknown the line is left out (B-5).
  const activeDelta = useMemo(() => {
    if (!ppl.data || !activeWk.data) return null
    const live = new Set(ppl.data.liveIds)
    return weekDelta(activeWk.data.cur.filter((u) => live.has(u)).length, activeWk.data.prev.filter((u) => live.has(u)).length)
  }, [ppl.data, activeWk.data])
  const confirmedNote = weeks.data && weeks.data.values.length > 1 ? `${weeks.data.values.at(-1)} confirmed this week (${weeks.data.values.at(-2)} last week)` : null

  return (
    <>
      <PageHead title="Dashboard"><button className="dk-b" onClick={() => setTick((t) => t + 1)} disabled={busy}>{busy ? 'Refreshing' : 'Refresh'}</button></PageHead>
      <div className="dk-grid">
        <div className="dk-s3"><Kpi label="Active this week" value={ppl.loading ? '...' : ppl.error || !ppl.data || ppl.data.active == null ? '-' : `${ppl.data.active} / ${ppl.data.total}`} foot={<>members who opened the app{activeDelta && <span className="hm-delta">{activeDelta}</span>}</>} href={deskHref('members')} /></div>
        <div className="dk-s3"><Kpi label="To confirm" value={queue.loading ? '...' : queue.error || !q ? '-' : q.total} foot={<>{q?.biggest ? `Mostly ${kindWord(q.biggest.kind, q.biggest.n)} (${q.biggest.n})` : 'Open the queue'}{confirmedNote && <span className="hm-delta">{confirmedNote}</span>}</>} href={deskHref('queue')} tone={toneIf(q?.total, 'warn')} /></div>
        <div className="dk-s3"><Kpi label="Failed scans" value={num(failed)} foot="Open files and scans" href={deskHref('files')} tone={toneIf(failed.data, 'bad')} /></div>
        <div className="dk-s3"><Kpi label="IDs expiring in 60 days" value={num(expiring)} foot="See which IDs and when" href={deskHref('ids')} tone={toneIf(expiring.data, 'warn')} /></div>

        <Card id="hm-use" title="App use, last 30 days" cls="dk-s6" src={usage}>{usage.data && <Chart title="Screens opened per day" series={usage.data} unit="Screens opened" />}</Card>
        <Card id="hm-conf" title="Records confirmed per week" cls="dk-s6" src={weeks}>{weeks.data && <Chart title="Labs and papers confirmed per week" series={weeks.data} bars weekly unit="Confirmed" />}</Card>

        <Card id="hm-q" title="Confirm queue by person" cls="dk-s4" link={['Open', deskHref('queue')]} src={queue}>
          {q && q.byPerson.length === 0 ? <div className="dk-card-b"><Empty>Nothing waiting. New scans will show up here.</Empty></div> : q && (
            <div className="dk-scrollx"><table className="dk-table">
              <thead><tr><th scope="col">Person</th><th scope="col">Waiting</th></tr></thead>
              <tbody>{q.byPerson.slice(0, 5).map((p) => (
                <tr key={p.person_id} className="dk-click" onClick={() => { location.hash = deskHref('queue', p.person_id) }}>
                  <th scope="row"><a href={deskHref('queue', p.person_id)}>{people.nameOf(p.person_id)}</a></th>
                  <td><span className="hm-tags">{p.kinds.slice(0, 3).map((k) => <Tag key={k.kind} tone="warn">{k.n} {kindWord(k.kind, k.n)}</Tag>)}</span></td>
                </tr>
              ))}</tbody>
            </table></div>
          )}
        </Card>

        <Card id="hm-need" title="Needs you" cls="dk-s4" src={needsSrc}>
          {needs.length === 0 ? <div className="dk-card-b"><Empty>Nothing needs you right now.</Empty></div> : (
            <ul className="hm-list">{needs.map((n) => <li key={n.key}><a href={n.href}><span>{n.text}</span><b>{n.action}</b></a></li>)}</ul>
          )}
        </Card>

        <ScheduleCard />

        <Card id="hm-recent" title="Recent changes" cls="dk-s12" link={['All history', deskHref('history')]} src={recent}>
          {recent.data && recent.data.length === 0 ? <div className="dk-card-b"><Empty>No changes recorded yet.</Empty></div> : recent.data && (
            <div className="dk-scrollx"><table role="table" className="dk-table dk-cardtab">
              <thead role="rowgroup"><tr role="row"><th role="columnheader" scope="col">When</th><th role="columnheader" scope="col">Who</th><th role="columnheader" scope="col">What</th><th role="columnheader" scope="col">Person</th><th role="columnheader" scope="col">Fields</th></tr></thead>
              <tbody role="rowgroup">{recent.data.map((r) => (
                <tr role="row" key={r.id}>
                  <td role="cell" data-label="When"><time dateTime={r.at} title={dateTime(r.at)}>{ago(r.at, now)}</time></td>
                  <td role="cell" data-label="Who">{who(r.actor)}</td>
                  <td role="cell" data-label="What"><Tag tone={actionTone(r.action)}>{statusLabel(r.action)}</Tag> {tableWords(r.tbl)}</td>
                  <td role="cell" data-label="Person">{r.person_id ? people.nameOf(r.person_id) : ''}</td>
                  <td role="cell" data-label="Fields" className="hm-fields">{fieldsText(r.fields)}</td>
                </tr>
              ))}</tbody>
            </table></div>
          )}
        </Card>
      </div>
    </>
  )
}
