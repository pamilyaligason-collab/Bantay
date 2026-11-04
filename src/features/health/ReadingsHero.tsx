import { useMemo, useState } from 'react'
import { Segmented } from '../look/Segmented'
import { CHIP, GUIDE, latestVsNormal, rangeState, toCanonicalReading, type Range, type Reading } from './ranges'
import { effectiveRange, inPeriod, shortDate, type Period } from './model'
import { MetricChart } from './MetricChart'
import { bpHeadlineArg } from './MetricScreen'
import { bpDoctorOf, kindOf } from './verdict'

type Part = 'am' | 'pm' | 'all'
const partOf = (iso: string) => (new Date(iso).getHours() < 12 ? 'am' : 'pm')

/** Readings page hero (board order): title and verdict word, Period and Time of day, the chart with its green band, then the latest pair and Add reading.
 *  The latest number is the newest reading of the chosen time of day, and the chart is drawn from the same list and anchored so that reading is always on it: the number and the dot are one value. */
export function ReadingsHero({ readings, thresholds, personId, onAdd }: { readings: Reading[]; thresholds: (Range & { key: string })[]; personId: string; onAdd?: () => void }) {
  const [period, setPeriod] = useState<Period>('week')
  const [part, setPart] = useState<Part>('all')
  const clock = useMemo(() => new Date(), [])
  const mine = readings.filter((r) => r.test === 'bp_systolic').map(toCanonicalReading).filter((r): r is NonNullable<typeof r> => !!r)
    .sort((a, b) => Date.parse(b.takenAt) - Date.parse(a.takenAt))
  const pool = mine.filter((r) => part === 'all' || partOf(r.takenAt) === part)
  const latest = pool[0]
  const now = latest && Date.parse(latest.takenAt) > clock.getTime() ? new Date(latest.takenAt) : clock // a reading stamped after this phone's clock still sits on the chart, at its own date
  const family = thresholds.find((t) => t.key === `${personId}:bp_systolic`)
  const v = latest ? latestVsNormal(latest, family) : null
  const st = v && latest ? rangeState(v.headline, kindOf('bp_systolic'), bpHeadlineArg(readings, 'bp_systolic', latest, bpDoctorOf(thresholds, personId))) : null
  const mate = latest ? bpHeadlineArg(readings, 'bp_systolic', latest, bpDoctorOf(thresholds, personId)).bottom : undefined
  const band = (latest ? effectiveRange(latest, family).range : null) ?? GUIDE.bp_systolic ?? null
  const shown = inPeriod([...pool].reverse().map((r) => ({ takenAt: r.takenAt, value: r.value })), period, now)
  if (mine.length === 0) {
    return (
      <section className="rh" aria-label="Blood pressure" data-testid="rd-hero" data-hero>
        <p className="rh-now"><span className="sub">Blood pressure</span><strong className="hv-big">--/--<small className="sub"> mmHg</small></strong><span className="sub">No reading yet</span></p>
        <p className="sub rh-empty">{onAdd ? 'A healthy range shows as the green band once you add one.' : 'No blood pressure reading yet.'}</p>
        {onAdd && <button type="button" className="btn" onClick={onAdd}>Add reading</button>}
      </section>
    )
  }
  return (
    <section className="rh" aria-label="Blood pressure" data-testid="rd-hero" data-hero>
      <div className="rh-head">
        <b>Blood pressure</b>
        {st && <span className={`hv-state ${CHIP[st.kind]}`}>{st.word}{st.hidden && <span className="hv-sr">. {st.hidden}</span>}</span>}
      </div>
      <Segmented<Period> label="Period" value={period} onChange={setPeriod} options={[{ id: 'week', label: 'This week' }, { id: 'month', label: 'This month' }]} />
      <Segmented<Part> label="Time of day" value={part} onChange={setPart} options={[{ id: 'all', label: 'All' }, { id: 'am', label: 'Morning' }, { id: 'pm', label: 'Evening' }]} />
      {shown.length === 0
        ? <p className="sub rh-empty">{pool.length === 0 ? `No ${part === 'am' ? 'morning' : 'evening'} readings yet.` : `No readings this ${period}.`} A healthy range shows as the green band.</p>
        : <MetricChart pts={shown} days={period === 'week' ? 7 : 30} now={now} band={band} label={`Blood pressure ${period === 'week' ? 'this week' : 'this month'}`} unit="mmHg" />}
      {latest && (
        <p className="rh-now">
          <span className="sub">Latest{part === 'am' ? ' morning' : part === 'pm' ? ' evening' : ''} · {shortDate(latest.takenAt)}</span>
          <strong className="hv-big" data-testid="rd-latest">{mate != null ? `${latest.value}/${mate}` : latest.value}<small className="sub"> mmHg</small></strong>
        </p>
      )}
      {onAdd && <button type="button" className="btn rh-add" onClick={onAdd}>Add reading</button>}
    </section>
  )
}
