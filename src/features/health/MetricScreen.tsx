import { useEffect, useMemo, useRef, useState } from 'react'
import { GUIDE, latestVsNormal, type Reading } from './ranges'
import { PersonChips } from '../records/PersonChips'
import { useHealthData } from '../records/useHealthData'
import {
  ACTIVITY_CODES, ADVICE, ADVICE_FALLBACK, MORE_INFO, MOOD_WORD, activitySeries, hoursMinutes, inPeriod, isActivityCode,
  metricLabel, monthlyAverages, rangeLine, shortDate, type Period, type Point
} from './model'
import { useActivity } from './useActivity'

const NO_DRAFTS: Record<string, number> = {}
const HIDDEN = { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' } as const
const ACT_LABEL: Record<string, { label: string; unit: string }> = { steps: { label: 'Steps', unit: 'steps' }, sleep: { label: 'Sleep', unit: 'hours' }, mood: { label: 'Mood', unit: '' } }

const words = (pts: Point[]) => {
  if (pts.length < 2) return ''
  const first = pts[0]!.value
  const last = pts[pts.length - 1]!.value
  return last > first ? ', going up' : last < first ? ', going down' : ', steady'
}

/** The week or month graph. uPlot is imported when a chart is drawn (it touches matchMedia at import). */
function Graph({ pts, label }: { pts: Point[]; label: string }) {
  const box = useRef<HTMLDivElement>(null)
  const sig = pts.map((p) => `${p.takenAt}:${p.value}`).join('|')
  useEffect(() => {
    const el = box.current
    if (!el || pts.length === 0) return
    let chart: { destroy(): void; setSize(o: { width: number; height: number }): void } | undefined
    let live = true
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => chart?.setSize({ width: Math.max(el.clientWidth, 200), height: 150 }))
    ro?.observe(el)
    void import('../records/trend')
      .then((m) => {
        if (!live) return
        el.innerHTML = ''
        chart = m.trendChart(el, pts.map((p) => ({ personId: '', test: label, takenAt: p.takenAt, value: p.value })) as Reading[], Math.max(el.clientWidth, 200))
      })
      .catch(() => { if (el) el.textContent = 'The graph could not be drawn here.' })
    return () => { live = false; ro?.disconnect(); chart?.destroy() }
  }, [sig]) // eslint-disable-line react-hooks/exhaustive-deps
  const vals = pts.map((p) => p.value)
  return <div ref={box} role="img" aria-label={`${label}, ${pts.length} readings from ${Math.min(...vals)} to ${Math.max(...vals)}${words(pts)}`} />
}

/** #health/metric/<code>: the week and month view of one measurement (mockup v6 "metric"). */
export default function MetricScreen({ code }: { code: string }) {
  const { ready, people, ownId, personId, setPersonId, readings, thresholds } = useHealthData()
  const acts = useActivity(personId)
  const [period, setPeriod] = useState<Period>('week')
  const now = useMemo(() => new Date(), [])
  const activity = isActivityCode(code)
  const known = activity || readings.some((r) => r.test === code) || !!GUIDE[code]
  const mine = readings.filter((r) => r.test === code).sort((a, b) => Date.parse(b.takenAt) - Date.parse(a.takenAt))
  const pts: Point[] = activity ? activitySeries(acts, code as (typeof ACTIVITY_CODES)[number]) : [...mine].reverse().map((r) => ({ takenAt: r.takenAt, value: r.value }))
  const shown = inPeriod(pts, period, now)
  const label = activity ? ACT_LABEL[code]!.label : metricLabel(code)
  const unit = activity ? ACT_LABEL[code]!.unit : (mine[0]?.unit ?? GUIDE[code]?.unit ?? '')
  const latest = mine[0]
  const family = thresholds.find((t) => t.key === `${personId}:${code}`)
  const v = latest ? latestVsNormal(latest, family) : null
  const last = pts[pts.length - 1]
  const who = people.find((p) => p.id === personId)?.name.split(' ')[0] ?? ''
  const months = monthlyAverages(pts, now)
  const dp = (n: number) => (activity && code === 'sleep' ? `${hoursMinutes(n * 60)}` : String(n))

  return (
    <>
      <div className="hv-top">
        <a className="hv-back" href="#health" aria-label="Back to Health">
          <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </a>
        <div className="hdr">
          <h1>{label}</h1>
          <span>{who ? `${who} · ` : ''}latest vs normal</span>
        </div>
      </div>
      <PersonChips people={people} ownId={ownId} personId={personId} drafts={NO_DRAFTS} onPick={setPersonId} />

      {!ready ? null : !known || pts.length === 0 ? (
        <div className="grp" style={{ marginTop: 12 }}>
          <div className="row">
            <span className="grow">
              No readings for this yet
              <span className="sub">Log one from Today, or confirm imported results in Family &gt; Records.</span>
            </span>
          </div>
        </div>
      ) : (
        <>
          <div className="grp hv-latest" style={{ marginTop: 12 }}>
            <div className="row">
              <span className="grow">
                <span className="sub">Latest{(latest?.takenAt ?? last?.takenAt) ? ` · ${shortDate(latest?.takenAt ?? last!.takenAt)}` : ''}</span>
                <strong className="hv-big">
                  {code === 'mood' && last ? (MOOD_WORD[last.value >= 2.5 ? 'mood-good' : last.value >= 1.5 ? 'mood-ok' : 'mood-low'] ?? '') : latest ? latest.value : last ? dp(last.value) : '--'}
                  {code !== 'mood' && unit ? <small className="sub"> {unit}</small> : null}
                </strong>
              </span>
              {v?.headlineText && <span className={`hv-state ${v.headline}`}>{v.headlineText}</span>}
            </div>
          </div>

          <div className="seg" role="group" aria-label="Period">
            <button type="button" aria-pressed={period === 'week'} onClick={() => setPeriod('week')}>This week</button>
            <button type="button" aria-pressed={period === 'month'} onClick={() => setPeriod('month')}>This month</button>
          </div>
          <div className="grp hv-graph">
            {shown.length === 0 ? (
              <p className="sub" style={{ margin: 0, padding: 16 }}>Nothing in the last {period === 'week' ? '7' : '30'} days. Newer readings will show here.</p>
            ) : (
              <Graph pts={shown} label={`${label} ${period === 'week' ? 'this week' : 'this month'}`} />
            )}
          </div>
          <section aria-labelledby="hv-ma">
            <h2 className="hd" id="hv-ma">Monthly averages</h2>
            {months.length === 0 ? (
              <div className="grp"><div className="row"><span className="grow">Not enough yet<span className="sub">Averages show once there are readings in a month.</span></span></div></div>
            ) : (
              <div className="grp" data-testid="monthly">
                {months.map((m) => (
                  <div className="row" key={m.month}>
                    <span className="grow">{m.label}<span className="sub">{m.n} {m.n === 1 ? 'reading' : 'readings'}</span></span>
                    <strong>{dp(m.avg)}{!activity && unit ? ` ${unit}` : ''}</strong>
                  </div>
                ))}
              </div>
            )}
          </section>

          {!activity && latest && v && (
            <section aria-labelledby="hv-src">
              <h2 className="hd" id="hv-src">Where the range comes from</h2>
              <div className="grp">
                <div className="row" style={{ alignItems: 'flex-start' }}>
                  <span className="grow">
                    {rangeLine(latest, family) || 'No range for this yet'}
                    {v.guide && (
                      <span className="sub">
                        <a href={v.guide.url} target="_blank" rel="noreferrer" style={{ color: 'var(--act)' }}>
                          {v.guide.source}, {v.guide.year}
                          <span style={HIDDEN}> (opens in new tab)</span>
                        </a>
                      </span>
                    )}
                    {!v.lab.text && !v.family && !v.guide && <span className="sub">Your lab report prints its own range. Confirm the record to see it here.</span>}
                  </span>
                </div>
              </div>
            </section>
          )}

          {!activity && mine.length > 0 && (
            <section aria-labelledby="hv-rec">
              <h2 className="hd" id="hv-rec">Recent records</h2>
              <div className="grp" data-testid="recent">
                {mine.slice(0, 5).map((r, i) => (
                  <div className="row" key={`${r.takenAt}:${i}`}>
                    <span className="grow"><strong>{r.value}{r.unit ? ` ${r.unit}` : ''}</strong><span className="sub" style={{ display: 'block' }}>{shortDate(r.takenAt)}</span></span>
                  </div>
                ))}
              </div>
            </section>
          )}

          <div className="grp hv-advice" style={{ marginTop: 16 }}>
            <div className="row" style={{ alignItems: 'flex-start', flexDirection: 'column', gap: 6 }}>
              <strong>General tips</strong>
              <span>{ADVICE[code] ?? ADVICE_FALLBACK}</span>
              <span className="sub">General information, not medical advice. Your doctor sets your own target.</span>
              <a href={MORE_INFO.url} target="_blank" rel="noreferrer" style={{ color: 'var(--act)', minHeight: 44, display: 'inline-flex', alignItems: 'center' }}>
                {MORE_INFO.text}
                <span style={HIDDEN}> (opens in new tab)</span>
              </a>
            </div>
          </div>
        </>
      )}
    </>
  )
}
