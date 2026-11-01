import { useMemo, useState } from 'react'
import { Segmented } from '../look/Segmented'
import { CHIP, GUIDE, latestVsNormal, rangeState, toCanonicalReading, type Range, type Reading } from './ranges'
import { effectiveRange, inPeriod, shortDate, type Period } from './model'
import { MetricChart } from './MetricChart'
import { bpHeadlineArg } from './MetricScreen'
import { bpDoctorOf, kindOf } from './verdict'

type Part = 'am' | 'pm' | 'all'
const partOf = (iso: string) => (new Date(iso).getHours() < 12 ? 'am' : 'pm')

/** Readings page hero: the blood pressure (top number) chart with its green band, a Period and a Time of day switch, and the latest pair with its one word. */
export function ReadingsHero({ readings, thresholds, personId }: { readings: Reading[]; thresholds: (Range & { key: string })[]; personId: string }) {
  const [period, setPeriod] = useState<Period>('week')
  const [part, setPart] = useState<Part>('all')
  const now = useMemo(() => new Date(), [])
  const mine = readings.filter((r) => r.test === 'bp_systolic').map(toCanonicalReading).filter((r): r is NonNullable<typeof r> => !!r)
    .sort((a, b) => Date.parse(b.takenAt) - Date.parse(a.takenAt))
  const latest = mine[0]
  const family = thresholds.find((t) => t.key === `${personId}:bp_systolic`)
  const v = latest ? latestVsNormal(latest, family) : null
  const st = v && latest ? rangeState(v.headline, kindOf('bp_systolic'), bpHeadlineArg(readings, 'bp_systolic', latest, bpDoctorOf(thresholds, personId))) : null
  const mate = latest ? bpHeadlineArg(readings, 'bp_systolic', latest, bpDoctorOf(thresholds, personId)).bottom : undefined
  const band = (latest ? effectiveRange(latest, family).range : null) ?? GUIDE.bp_systolic ?? null
  const shown = inPeriod(mine.filter((r) => part === 'all' || partOf(r.takenAt) === part).reverse().map((r) => ({ takenAt: r.takenAt, value: r.value })), period, now)
  return (
    <section className="rh" aria-label="Blood pressure" data-testid="readings-hero" data-hero>
      <Segmented<Period> label="Period" value={period} onChange={setPeriod} options={[{ id: 'week', label: 'This week' }, { id: 'month', label: 'This month' }]} />
      <Segmented<Part> label="Time of day" value={part} onChange={(id) => setPart(part === id ? 'all' : id)} options={[{ id: 'am', label: 'Morning' }, { id: 'pm', label: 'Evening' }]} />
      {latest && (
        <p className="rh-now">
          <span className="sub">Latest · {shortDate(latest.takenAt)}</span>
          <strong className="hv-big">{mate != null ? `${latest.value}/${mate}` : latest.value}<small className="sub"> mmHg</small></strong>
          {st && <span className={`hv-state ${CHIP[st.kind]}`}>{st.word}{st.hidden && <span className="hv-sr">. {st.hidden}</span>}</span>}
        </p>
      )}
      {shown.length === 0
        ? <p className="sub rh-empty">No readings this {period}. A healthy range shows as the green band.</p>
        : <MetricChart pts={shown} days={period === 'week' ? 7 : 30} now={now} band={band} label={`Blood pressure ${period === 'week' ? 'this week' : 'this month'}`} unit="mmHg" />}
    </section>
  )
}
