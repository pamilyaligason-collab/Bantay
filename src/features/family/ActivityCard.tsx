import { liveQuery } from 'dexie'
import { useEffect, useMemo, useState } from 'react'
import type { Reading } from '../health/ranges'
import { ldb, type Activity, type MedTaken, type Medication } from '../log/store'
import { EmptyState, Section, Segmented } from '../look'
import { hdb } from '../records/store'
import { useViewedVisibleIds } from '../viewas/viewAs'
import { faceName } from './FacesRow'
import { useFamilyPeople } from './roster'
import { seriesColor, WeekChart } from './WeekChart'
import { bpSeries, doseSeries, legendWord, stepSeries, type Metric } from './weekSeries'
import './v13-family.css'

type D = { readings: Reading[]; acts: Activity[]; meds: Medication[]; takes: MedTaken[] }
const TITLES: Record<Metric, { t: string; u: string; label: string }> = {
  bp: { t: 'Top number (systolic)', u: 'mmHg', label: 'Blood pressure over 7 days' },
  steps: { t: 'Steps a day', u: 'steps', label: 'Steps over 7 days' },
  meds: { t: 'Medicines taken', u: '% taken', label: 'Medicines taken over 7 days' }
}
const EMPTY_BODY: Record<Metric, string> = {
  bp: 'No readings shared with you this week. Blood pressure shows here once someone saves or shares it.',
  steps: 'Steps show here once a phone shares them.',
  meds: 'Doses show here once a medicine has times and is marked.'
}

/** Activity (board): BP | Steps | Medicines for the people this phone can see, last 7 days, from the readings, steps and doses already on this phone. Nothing is invented: no data = an empty state. */
export function ActivityCard() {
  const { people: all } = useFamilyPeople()
  const visible = useViewedVisibleIds()
  const people = visible ? all.filter((p) => visible.has(p.id)) : all
  const key = people.map((p) => p.id).join(',')
  const [d, setD] = useState<D | null>(null)
  const [metric, setMetric] = useState<Metric>('bp')
  const now = useMemo(() => new Date(), [d]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const ids = key ? key.split(',') : []
    const sub = liveQuery(async () => ({
      readings: await hdb.readings.where('personId').anyOf(ids).toArray(),
      acts: (await ldb.activity.where('personId').anyOf(ids).toArray()).filter((a) => a.kind === 'steps'),
      meds: await ldb.medications.where('personId').anyOf(ids).toArray(),
      takes: await ldb.meds.where('personId').anyOf(ids).toArray()
    })).subscribe({ next: setD, error: () => setD({ readings: [], acts: [], meds: [], takes: [] }) })
    return () => sub.unsubscribe()
  }, [key])
  const ids = people.map((p) => p.id)
  const series = !d ? [] : metric === 'bp' ? bpSeries(d.readings, ids, now) : metric === 'steps' ? stepSeries(d.acts, ids, now) : doseSeries(d.meds, d.takes, ids, now)
  const allEmpty = series.every((s) => s.empty)
  const nameOf = (id: string) => { const p = people.find((x) => x.id === id); return p?.isMe ? 'You' : faceName(p?.name ?? 'Someone') }
  return (
    <Section title="Activity" meta="This week" testId="activity">
      <div className="card ac">
        <Segmented label="Show" value={metric} onChange={setMetric} options={[{ id: 'bp', label: 'BP' }, { id: 'steps', label: 'Steps' }, { id: 'meds', label: 'Medicines' }]} />
        {!d ? <p className="sub" aria-busy="true">Loading…</p> : allEmpty ? (
          <EmptyState icon="heart" title="Nothing to chart yet" body={EMPTY_BODY[metric]} />
        ) : (
          <>
            <div className="ac-h"><b>{TITLES[metric].t}</b><span className="sub">{TITLES[metric].u}</span></div>
            <WeekChart metric={metric} series={series} now={now} label={`${TITLES[metric].label} for ${series.map((s) => nameOf(s.personId)).join(', ')}`} />
            <ul className="wk-leg" aria-label="Who is who">
              {series.map((s, i) => <li key={s.personId} data-empty={s.empty}><i style={{ borderTopColor: seriesColor(i) }} aria-hidden="true" />{nameOf(s.personId)} · {legendWord(metric, s)}</li>)}
            </ul>
            {metric === 'bp' && <p className="sub">Green band = healthy range.</p>}
          </>
        )}
      </div>
    </Section>
  )
}
