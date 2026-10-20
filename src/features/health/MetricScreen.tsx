import { useMemo, useState } from 'react'
import { formatNumber } from '../../lib/labFormat'
import { GUIDE, latestVsNormal, rangeState } from './ranges'
import { PersonChips } from '../records/PersonChips'
import { useHealthPerson } from './useHealthPerson'
import AddReadingSheet from './AddReadingSheet'
import { MetricChart } from './MetricChart'
import { entrySpec } from './readingPreview'
import { PULSE_RANGE } from './vitals'
import {
  ACTIVITY_CODES, ADVICE, ADVICE_FALLBACK, MORE_INFO, MOOD_WORD, activitySeries, hoursMinutes, inPeriod, isActivityCode,
  effectiveRange, metricLabel, monthlyAverages, rangeLine, shortDate, type Period, type Point
} from './model'
import { SubHeader } from '../shell/SubHeader'
import { useActivity } from './useActivity'

const NO_DRAFTS: Record<string, number> = {}
const HIDDEN = { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' } as const
const ACT_LABEL: Record<string, { label: string; unit: string }> = { steps: { label: 'Steps', unit: 'steps' }, sleep: { label: 'Sleep', unit: 'hours' }, mood: { label: 'Mood', unit: '' } }

/** #health/metric/<code>: the week and month view of one measurement (mockup v6 "metric"). */
export default function MetricScreen({ code }: { code: string }) {
  const { ready, people, ownId, personId, setPersonId, readings, thresholds, canMark, reload } = useHealthPerson()
  const acts = useActivity(personId)
  const [period, setPeriod] = useState<Period>('month')
  const [part, setPart] = useState<'am' | 'pm' | null>(null)
  const [adding, setAdding] = useState(false)
  const [saved, setSaved] = useState('')
  const now = useMemo(() => new Date(), [])
  const activity = isActivityCode(code)
  const known = activity || readings.some((r) => r.test === code) || !!GUIDE[code]
  const partOf = (iso: string) => (new Date(iso).getHours() < 12 ? 'am' : 'pm')
  const mine = readings.filter((r) => r.test === code).sort((a, b) => Date.parse(b.takenAt) - Date.parse(a.takenAt))
  const minePart = part ? mine.filter((r) => partOf(r.takenAt) === part) : mine
  const pts: Point[] = activity ? activitySeries(acts, code as (typeof ACTIVITY_CODES)[number]) : [...minePart].reverse().map((r) => ({ takenAt: r.takenAt, value: r.value }))
  const shown = inPeriod(pts, period, now)
  const label = activity ? ACT_LABEL[code]!.label : metricLabel(code)
  const unit = activity ? ACT_LABEL[code]!.unit : (mine[0]?.unit ?? GUIDE[code]?.unit ?? '')
  const latest = mine[0]
  const family = thresholds.find((t) => t.key === `${personId}:${code}`)
  const v = latest ? latestVsNormal(latest, family) : null
  const last = pts[pts.length - 1]
  const months = monthlyAverages(pts, now)
  const band = activity ? null : (latest ? effectiveRange(latest, family).range : null) ?? (code === 'heart_rate' ? PULSE_RANGE : null)
  const spec = entrySpec(code)
  const dp = (n: number) => (activity && code === 'sleep' ? `${hoursMinutes(n * 60)}` : formatNumber(n))

  return (
    <>
      <SubHeader title={label} backHref="#health" backLabel="Back to Health" />
      <PersonChips people={people} ownId={ownId} personId={personId} drafts={NO_DRAFTS} onPick={setPersonId} />

      {!ready ? null : !known || (pts.length === 0 && !part) ? (
        <div className="grp" style={{ marginTop: 12 }}>
          <div className="row">
            <span className="grow">
              No readings for this yet
              <span className="sub">Log one from Today, or confirm imported results in Family &gt; Records.</span>
            </span>
          </div>
          {spec && canMark && personId && <div className="row"><button type="button" className="btn mc-add" onClick={() => setAdding(true)}>Add reading</button></div>}
        </div>
      ) : (
        <>
          <div className="grp hv-latest" style={{ marginTop: 12 }}>
            <div className="row">
              <span className="grow">
                <span className="sub">Latest{(latest?.takenAt ?? last?.takenAt) ? ` · ${shortDate(latest?.takenAt ?? last!.takenAt)}` : ''}</span>
                <strong className="hv-big">
                  {code === 'mood' && last ? (MOOD_WORD[last.value >= 2.5 ? 'mood-good' : last.value >= 1.5 ? 'mood-ok' : 'mood-low'] ?? '') : latest ? formatNumber(latest.value) : last ? dp(last.value) : '--'}
                  {code !== 'mood' && unit ? <small className="sub"> {unit}</small> : null}
                </strong>
              </span>
              {v && !activity && (() => { const st = rangeState(v.headline); return <span className={`hv-state ${v.headline}`}>{st.word}{st.hidden && <span className="hv-sr">. {st.hidden}</span>}</span> })()}
            </div>
          </div>

          {spec && canMark && personId && <button type="button" className="btn mc-add" onClick={() => setAdding(true)}>Add reading</button>}
          {saved && <p className="sub" role="status">{saved}</p>}
          <div className="seg" role="group" aria-label="Period">
            <button type="button" aria-pressed={period === 'week'} onClick={() => setPeriod('week')}>This week</button>
            <button type="button" aria-pressed={period === 'month'} onClick={() => setPeriod('month')}>This month</button>
          </div>
          {!activity && (
            <div className="seg mc-part" role="group" aria-label="Time of day">
              <button type="button" aria-pressed={part === 'am'} onClick={() => setPart(part === 'am' ? null : 'am')}>Morning</button>
              <button type="button" aria-pressed={part === 'pm'} onClick={() => setPart(part === 'pm' ? null : 'pm')}>Evening</button>
            </div>
          )}
          <div className="grp hv-graph">
            {shown.length === 0 ? (
              <p className="sub" style={{ margin: 0, padding: 16 }}>Nothing in the last {period === 'week' ? '7' : '30'} days. Newer readings will show here.</p>
            ) : (
              <MetricChart pts={shown} days={period === 'week' ? 7 : 30} now={now} band={band} label={`${label} ${period === 'week' ? 'this week' : 'this month'}`} unit={unit} />
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
                    {!v.lab.text && (v.guide || v.family || v.general) && <span className="sub">Lab range: not printed</span>}
                    {v.guide && (
                      <span className="sub">
                        <a href={v.guide.url} target="_blank" rel="noreferrer" style={{ color: 'var(--act)' }}>
                          {v.guide.source}, {v.guide.year}
                          <span style={HIDDEN}> (opens in new tab)</span>
                        </a>
                      </span>
                    )}
                    {!v.lab.text && !v.family && !v.guide && !v.general && <span className="sub">Your lab report prints its own range. Confirm the record to see it here.</span>}
                  </span>
                </div>
              </div>
            </section>
          )}

          {!activity && mine.length > 0 && (
            <section aria-labelledby="hv-rec">
              <h2 className="hd" id="hv-rec">Readings</h2>
              <div className="grp" data-testid="recent">
                {minePart.length === 0 && <div className="row"><span className="grow">No {part === 'am' ? 'morning' : 'evening'} readings<span className="sub">Try the other time of day.</span></span></div>}
                {minePart.slice(0, 12).map((r, i) => (
                  <div className="row" key={`${r.takenAt}:${i}`}>
                    <span className="grow"><strong>{formatNumber(r.value)}{r.unit ? ` ${r.unit}` : ''}</strong><span className="sub" style={{ display: 'block' }}>{shortDate(r.takenAt)} · {new Date(r.takenAt).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })}</span></span>
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
      {adding && spec && <AddReadingSheet spec={spec} personId={personId} forName={people.find((x) => x.id === personId)?.name ?? ''} family={family} onClose={() => setAdding(false)} onSaved={(m) => { setSaved(m); reload() }} />}
    </>
  )
}
