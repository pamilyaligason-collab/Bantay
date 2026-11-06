import { useMemo } from 'react'
import { formatNumber } from '../../lib/labFormat'
import { Section } from '../look'
import { MetricChart } from './MetricChart'
import { bpHeadlineArg } from './MetricScreen'
import { effectiveRange, inPeriod, shortDate } from './model'
import { CHIP, GUIDE, latestVsNormal, rangeState, toCanonicalReading, type Range, type Reading } from './ranges'
import { bpDoctorOf, kindOf } from './verdict'
import { PinnedTiles } from './PinnedTiles'

type Code = 'heart_rate' | 'bp_systolic' | 'fasting_glucose'
const newest = (rs: Reading[], test: string) => rs.filter((r) => r.test === test && Number.isFinite(Date.parse(r.takenAt))).sort((a, b) => Date.parse(b.takenAt) - Date.parse(a.takenAt))[0]
const unitOf = (r: Reading, code: Code) => r.unit || (code === 'bp_systolic' ? 'mmHg' : code === 'heart_rate' ? 'bpm' : 'mg/dL')

/** Readings, expanded: the latest pulse (else blood pressure) as a big number with the same in-range chip as its metric page, a 7-day chart, two smaller latest values and Add a reading.
 *  Nothing logged at all: "--" and the same first step, never a 0. */
export function ReadingsCard({ personId, readings, thresholds, onAdd, canLog = true }: { personId: string; readings: Reading[]; thresholds: (Range & { key: string })[]; onAdd?: () => void; canLog?: boolean }) {
  const mine = useMemo(() => readings.filter((r) => r.personId === personId).map(toCanonicalReading).filter((r): r is Reading => !!r), [readings, personId])
  const doctor = bpDoctorOf(thresholds, personId)
  const hr = newest(mine, 'heart_rate')
  const primary: Code = hr ? 'heart_rate' : 'bp_systolic'
  const latest = hr ?? newest(mine, 'bp_systolic')
  const family = thresholds.find((t) => t.key === `${personId}:${primary}`)
  const bpOf = (r: Reading) => { const m = bpHeadlineArg(mine, 'bp_systolic', r, doctor).bottom; return m != null ? `${formatNumber(r.value)}/${formatNumber(m)}` : formatNumber(r.value) }
  const valueOf = (r: Reading, code: Code) => (code === 'bp_systolic' ? bpOf(r) : formatNumber(r.value))
  const v = latest ? latestVsNormal(latest, family) : null
  const st = v && latest ? rangeState(v.headline, kindOf(primary), primary === 'bp_systolic' ? bpHeadlineArg(mine, primary, latest, doctor) : undefined) : null
  const now = useMemo(() => { const n = new Date(); return latest && Date.parse(latest.takenAt) > n.getTime() ? new Date(latest.takenAt) : n }, [latest])
  const week = latest ? inPeriod(mine.filter((r) => r.test === primary).sort((a, b) => Date.parse(a.takenAt) - Date.parse(b.takenAt)).map((r) => ({ takenAt: r.takenAt, value: r.value })), 'week', now) : []
  const band = (latest ? effectiveRange(latest, family).range : null) ?? GUIDE[primary] ?? null
  const subs: { code: Code; label: string }[] = [{ code: primary === 'heart_rate' ? 'bp_systolic' : 'heart_rate', label: primary === 'heart_rate' ? 'Blood pressure' : 'Pulse' }, { code: 'fasting_glucose', label: 'Blood sugar' }]
  return (
    <Section title="Readings" testId="readings-card" link={{ href: '#health/readings', label: 'All readings' }}>
      <div className="card rc" data-testid="rc-main">
        <div className="rc-top">
          <div>
            <span className="sub">{primary === 'heart_rate' ? 'Heart rate' : 'Blood pressure'}</span>
            <strong className="rc-big" data-testid="rc-value">{latest ? valueOf(latest, primary) : '--'}{latest && <small className="sub"> {unitOf(latest, primary)}</small>}</strong>
            {latest ? <span className="sub rc-when">{shortDate(latest.takenAt)}</span> : <span className="sub rc-when">No reading yet</span>}
          </div>
          {st && <span className={`hv-state ${CHIP[st.kind]}`} data-testid="rc-state">{st.word}{st.hidden && <span className="hv-sr">. {st.hidden}</span>}</span>}
        </div>
        {week.length > 0 && <MetricChart pts={week} days={7} now={now} band={band} label={`${primary === 'heart_rate' ? 'Heart rate' : 'Blood pressure'} this week`} unit={unitOf(latest!, primary)} />}
        {latest && week.length === 0 && <p className="sub rc-none">No readings in the last 7 days.</p>}
        <div className="rc-subs">
          {subs.map((s) => {
            const r = newest(mine, s.code)
            return (
              <a key={s.code} className="rc-sub" href={`#health/metric/${s.code}`} data-testid={`rc-sub-${s.code}`}>
                <span className="sub">{s.label}</span>
                <b>{r ? valueOf(r, s.code) : '--'}</b>
                <span className="sub">{r ? `${unitOf(r, s.code)} · ${shortDate(r.takenAt)}` : 'None yet'}</span>
              </a>
            )
          })}
        </div>
        <PinnedTiles personId={personId} readings={readings} canLog={canLog} inline />
        {onAdd && <button type="button" className="btn rc-add" onClick={onAdd}>Add a reading</button>}
      </div>
    </Section>
  )
}
