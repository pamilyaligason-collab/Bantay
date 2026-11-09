import { properName } from './medName'
import { useState } from 'react'
import { formatNumber } from '../../lib/labFormat'
import { CHIP, GUIDE, latestVsNormal, rangeState, toCanonicalReading, type Reading } from './ranges'
import { WhoLine } from './WhoLine'
import { useHealthPerson } from './useHealthPerson'
import AddReadingSheet from './AddReadingSheet'
import { MetricChart } from './MetricChart'
import { LabDetail } from './LabDetail'
import { STEP_GOAL } from '../today/myWeekLogic'
import { entrySpec } from './readingPreview'
import {
  ACTIVITY_CODES, ADVICE, ADVICE_FALLBACK, MORE_INFO, MOOD_WORD, activitySeries, hoursMinutes, inPeriod, isActivityCode,
  effectiveRange, metricLabel, monthlyAverages, rangeLine, shortDate, type Period, type Point
} from './model'
import { LargeTitle } from '../look/LargeTitle'
import { Segmented } from '../look/Segmented'
import { useActivity } from './useActivity'
import { useProfiles } from '../setup/useProfile'
import { ageOf } from '../family/roster'
import { SleepHero, SleepStagesRow } from './detail/SleepDetail'
import { ActivityHero, FamilyToday } from './detail/ActivityDetail'
import { YearBars } from './detail/YearBars'
import { sleepBand } from './detail/sleepLogic'
import { useNow } from './detail/useNow'
import { isVital } from './vitals'
import BpCheckButton from './bpcheck/BpCheckButton'
import BpWords from './bpcheck/BpWords'
import { BpWord } from './bpcheck/BpCheck'
import { bpDoctorOf, kindOf, type BpArg } from './verdict'

const HIDDEN = { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' } as const
const ACT_LABEL: Record<string, { label: string; unit: string }> = { steps: { label: 'Steps', unit: 'steps' }, sleep: { label: 'Sleep', unit: 'hours' }, mood: { label: 'Mood', unit: '' } }

/** #health/metric/<code>: the week and month view of one measurement (mockup v6 "metric"). */
/** The pair behind the headline word: the latest reading with its mate (the other number taken within 30 minutes), plus both doctor targets. Exported for the test. */
export function bpHeadlineArg(readings: Reading[], code: string, latest: Reading, doctor: BpArg['doctor']): BpArg {
  const mate = readings.filter((x) => x.test === (code === 'bp_systolic' ? 'bp_diastolic' : 'bp_systolic') && Math.abs(Date.parse(x.takenAt) - Date.parse(latest.takenAt)) <= 30 * 60_000)[0]?.value
  return code === 'bp_systolic' ? { top: latest.value, bottom: mate, doctor } : { top: mate, bottom: latest.value, doctor }
}

export default function MetricScreen({ code }: { code: string }) {
  const { ready, people, personId, readings, thresholds, canMark, reload } = useHealthPerson()
  const profiles = useProfiles()
  const [period, setPeriod] = useState<Period | 'year'>('month')
  const [part, setPart] = useState<'am' | 'pm' | null>(null)
  const [adding, setAdding] = useState(false)
  const [saved, setSaved] = useState('')
  const now = useNow() // moves on at local midnight, so "today" is never stale
  const activity = isActivityCode(code)
  const acts = useActivity(personId, activity ? 400 : 120) // a year of days for the year view and month-against-year
  const detail = code === 'sleep' || code === 'steps'
  const age = ageOf(profiles[personId]?.birthdate ?? null, now)
  const lab = !activity && !isVital(code) // lab results: sparse and dated, so a list, not a week/month chart
  const known = activity || readings.some((r) => r.test === code) || !!GUIDE[code]
  const partOf = (iso: string) => (new Date(iso).getHours() < 12 ? 'am' : 'pm')
  const mine = readings.filter((r) => r.test === code).map(toCanonicalReading).filter((r): r is NonNullable<typeof r> => !!r).sort((a, b) => Date.parse(b.takenAt) - Date.parse(a.takenAt))
  const minePart = part ? mine.filter((r) => partOf(r.takenAt) === part) : mine
  const pts: Point[] = activity ? activitySeries(acts, code as (typeof ACTIVITY_CODES)[number]) : [...minePart].reverse().map((r) => ({ takenAt: r.takenAt, value: r.value }))
  const shown = inPeriod(pts, period === 'year' ? 'month' : period, now)
  const label = activity ? ACT_LABEL[code]!.label : metricLabel(code)
  const unit = activity ? ACT_LABEL[code]!.unit : (mine[0]?.unit ?? GUIDE[code]?.unit ?? '')
  const latest = mine[0]
  const family = thresholds.find((t) => t.key === `${personId}:${code}`)
  const v = latest ? latestVsNormal(latest, family) : null
  const last = pts[pts.length - 1]
  const months = monthlyAverages(pts, now)
  const band = activity ? (code === 'sleep' ? sleepBand(age) : null) : (latest ? effectiveRange(latest, family).range : null) ?? GUIDE[code] ?? null
  const spec = entrySpec(code)
  const bpCode = code === 'bp_systolic' || code === 'bp_diastolic'
  const bpDoctor = bpDoctorOf(thresholds, personId) // both doctor targets, so every row of the pair, the headline and the add preview read the same word on either BP route
  // blood pressure reads as one pair (top/bottom, one verdict word from the one table); a pair is a top and the bottom taken at the same minute
  const bottomFor = (at: string) => { // the bottom written with this top (same moment); else the nearest one under a minute away
    const ds = readings.filter((d) => d.test === 'bp_diastolic')
    const near = ds.map((d) => ({ d, gap: Math.abs(Date.parse(d.takenAt) - Date.parse(at)) })).filter((x) => x.gap < 60_000).sort((a, b) => a.gap - b.gap)[0]
    return near?.d.value ?? null
  }
  const bpPairs = bpCode ? readings.filter((r) => r.test === 'bp_systolic').map((r) => ({ at: r.takenAt, top: r.value, bottom: bottomFor(r.takenAt) }))
    .filter((p) => !part || partOf(p.at) === part).sort((a, b) => Date.parse(b.at) - Date.parse(a.at)) : []
  const dp = (n: number) => (activity && code === 'sleep' ? `${hoursMinutes(n * 60)}` : formatNumber(n))

  return (
    <>
      <LargeTitle back={{ href: '#health', label: 'Health' }} title={label} />
      <WhoLine />

      {!ready ? null : !known || (pts.length === 0 && !part) ? (
        <div className="grp" style={{ marginTop: 12 }}>
          <div className="row">
            <span className="grow">
              No readings for this yet
              <span className="sub">Log one from Today, or confirm imported results in Health &gt; Papers.</span>
            </span>
          </div>
          {spec && canMark && personId && <div className="row"><button type="button" className="btn mc-add" onClick={() => setAdding(true)}>Add reading</button></div>}
        </div>
      ) : (
        <>
          {code === 'sleep' && <SleepHero acts={acts} age={age} now={now} />}
          {code === 'steps' && <ActivityHero acts={acts} now={now} />}
          {!lab && !detail && <div className="grp hv-latest" style={{ marginTop: 12 }}>
            <div className="row">
              <span className="grow">
                <span className="sub">Latest{(latest?.takenAt ?? last?.takenAt) ? ` · ${shortDate(latest?.takenAt ?? last!.takenAt)}` : ''}</span>
                <strong className="hv-big">
                  {code === 'mood' && last ? (MOOD_WORD[last.value >= 2.5 ? 'mood-good' : last.value >= 1.5 ? 'mood-ok' : 'mood-low'] ?? '') : bpPairs[0]?.bottom != null ? `${bpPairs[0].top}/${bpPairs[0].bottom}` : latest ? formatNumber(latest.value) : last ? dp(last.value) : '--'}
                  {code !== 'mood' && unit ? <small className="sub"> {unit}</small> : null}
                </strong>
              </span>
              {v && !activity && (() => { const st = rangeState(v.headline, kindOf(code), bpCode && latest ? bpHeadlineArg(readings, code, latest, bpDoctor) : undefined); return <span className={`hv-state ${CHIP[st.kind]}`}>{st.word}{st.hidden && <span className="hv-sr">. {st.hidden}</span>}</span> })()}
            </div>
          </div>}

          {lab && latest && <LabDetail code={code} readings={readings} family={family} personId={personId} />}
          {spec && canMark && personId && <button type="button" className="btn mc-add" onClick={() => setAdding(true)}>Add reading</button>}
          {bpCode && canMark && personId && <BpCheckButton personId={personId} forName={properName(people.find((x) => x.id === personId)?.name ?? '')} onSaved={(m) => { setSaved(m); reload() }} className="btn mc-add" />}
          {saved && <p className="sub" role="status">{saved}</p>}
          {!lab && (
            <Segmented<Period | 'year'> label="Period" value={period} onChange={setPeriod} options={[{ id: 'week', label: 'This week' }, { id: 'month', label: detail ? '30 days' : 'This month' }, ...(detail ? [{ id: 'year' as const, label: 'Year' }] : [])]} />
          )}
          {!activity && !lab && (
            <Segmented<'am' | 'pm' | 'all'> label="Time of day" value={part ?? 'all'} onChange={(id) => setPart(id === 'all' || part === id ? null : id)} options={[{ id: 'am', label: 'Morning' }, { id: 'pm', label: 'Evening' }]} />
          )}
          {!lab && <div className="grp hv-graph">
            {period === 'year' && detail ? (
              <YearBars pts={pts} now={now} unit={code === 'sleep' ? 'hours' : 'steps'} label={`${label}, last 12 months`} band={band && band.low != null && band.high != null ? { low: band.low, high: band.high } : null} />
            ) : shown.length === 0 ? (
              <p className="sub" style={{ margin: 0, padding: 16 }}>Nothing in the last {period === 'week' ? '7' : '30'} days. Newer readings will show here.</p>
            ) : (
              <MetricChart pts={shown} days={period === 'week' ? 7 : 30} now={now} band={band} label={`${label} ${period === 'week' ? 'this week' : 'this month'}`} unit={unit} goal={activity && code === 'steps' ? STEP_GOAL : null} />
            )}
          </div>}
          {code === 'sleep' && <SleepStagesRow />}
          {code === 'steps' && <FamilyToday now={now} />}
          {!lab && <section aria-labelledby="hv-ma">
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
          </section>}

          {bpCode && <BpWords />}
          {!activity && !lab && latest && v && (
            <section aria-labelledby="hv-src">
              <h2 className="hd" id="hv-src">Where the range comes from</h2>
              <div className="grp">
                <div className="row" style={{ alignItems: 'flex-start' }}>
                  <span className="grow">
                    {rangeLine(latest, family) || 'No range for this yet'}
                    {!v.lab.text && (v.guide || v.family || v.general) && <span className="sub">Lab range: not printed</span>}
                    {v.guide && (
                      <span className="sub">
                        <a href={v.guide.url} target="_blank" rel="noreferrer" className="mc-guide">
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

          {!activity && !lab && mine.length > 0 && (
            <section aria-labelledby="hv-rec">
              <h2 className="hd" id="hv-rec">Readings</h2>
              <div className="grp" data-testid="recent">
                {(bpCode ? bpPairs.length : minePart.length) === 0 && <div className="row"><span className="grow">No {part === 'am' ? 'morning' : 'evening'} readings<span className="sub">Try the other time of day.</span></span></div>}
                {bpCode && bpPairs.slice(0, 12).map((p, i) => (
                  <div className="row" key={`${p.at}:${i}`}>
                    <span className="grow"><strong>{p.bottom != null ? `${p.top}/${p.bottom}` : p.top} mmHg</strong><span className="sub" style={{ display: 'block' }}>{`${shortDate(p.at)} · ${new Date(p.at).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })}`}</span></span>
                    {p.bottom != null && <BpWord top={p.top} bottom={p.bottom} doctor={bpDoctor} />}
                  </div>
                ))}
                {!bpCode && minePart.slice(0, 12).map((r, i) => (
                  <div className="row" key={`${r.takenAt}:${i}`}>
                    <span className="grow"><strong>{formatNumber(r.value)}{r.unit ? ` ${r.unit}` : ''}</strong><span className="sub" style={{ display: 'block' }}>{`${shortDate(r.takenAt)} · ${new Date(r.takenAt).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })}`}</span></span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {!lab && <div className="grp hv-advice" style={{ marginTop: 16 }}>
            <div className="row" style={{ alignItems: 'flex-start', flexDirection: 'column', gap: 6 }}>
              <strong>General tips</strong>
              <span>{ADVICE[code] ?? ADVICE_FALLBACK}</span>
              <span className="sub">General information, not medical advice. Your doctor sets your own target.</span>
              <a href={MORE_INFO.url} target="_blank" rel="noreferrer" style={{ color: 'var(--act)', minHeight: 44, display: 'inline-flex', alignItems: 'center' }}>
                {MORE_INFO.text}
                <span style={HIDDEN}> (opens in new tab)</span>
              </a>
            </div>
          </div>}
        </>
      )}
      {adding && spec && <AddReadingSheet spec={spec} personId={personId} forName={properName(people.find((x) => x.id === personId)?.name ?? '')} family={bpCode ? undefined : family} bpDoctor={bpCode ? bpDoctor : undefined} onClose={() => setAdding(false)} onSaved={(m) => { setSaved(m); reload() }} />}
    </>
  )
}
