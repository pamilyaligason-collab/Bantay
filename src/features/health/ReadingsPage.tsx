import { useMemo, useState } from 'react'
import { GroupedList, LargeTitle, Row, Section, Skeleton, type Tint } from '../look'
import type { IconName } from '../shell/Icon'
import AddReadingSheet from './AddReadingSheet'
import { Kpis } from './Kpis'
import { LatestList } from './LatestList'
import { rangeSource } from './labsLogic'
import { MORE_INFO, type NodeId } from './model'
import { properName } from './medName'
import { GUIDE, toCanonicalReading } from './ranges'
import { ReadingsHero } from './ReadingsHero'
import { entrySpec } from './readingPreview'
import { useActivity } from './useActivity'
import { useHealthPerson } from './useHealthPerson'
import { bpDoctorOf } from './verdict'
import { averageNodes } from './vitals'
import { WhoLine } from './WhoLine'
import './health.css'

const TINT: Record<NodeId, Tint> = { bp: 'blue', sugar: 'amber', pulse: 'red', weight: 'teal', steps: 'green', sleep: 'purple', mood: 'amber' }
const UNIT_WORD: Partial<Record<NodeId, string>> = { bp: 'mmHg', sugar: 'mg/dL', pulse: 'beats per minute', weight: 'kg' }
const ICON: Record<NodeId, IconName> = { bp: 'gauge', sugar: 'drop', pulse: 'heart', weight: 'gauge', steps: 'move', sleep: 'clock', mood: 'smile' }

/** Health > Readings, in the board's order: hero, My numbers, Averages, where the range comes from, Last readings, Tips. The person is the one chosen on the Health root (H6): no chips here, and a skeleton until we know who "me" is. */
export default function ReadingsPage() {
  const { ready, people, personId, readings, thresholds, canMark, reload } = useHealthPerson()
  const acts = useActivity(personId)
  const [adding, setAdding] = useState(false)
  const [saved, setSaved] = useState('')
  const familyOf = (r: { personId: string; test: string }) => thresholds.find((t) => t.key === `${r.personId}:${r.test}`)
  const nodes = useMemo(() => averageNodes(readings, acts, new Date(), familyOf), [readings, acts, thresholds]) // eslint-disable-line react-hooks/exhaustive-deps
  const spec = entrySpec('bp_systolic')
  const onAdd = canMark && spec ? () => setAdding(true) : undefined
  const top = readings.filter((r) => r.test === 'bp_systolic').map(toCanonicalReading).filter((r): r is NonNullable<typeof r> => !!r).sort((a, b) => Date.parse(b.takenAt) - Date.parse(a.takenAt))[0]
  const src = top ? rangeSource(top, thresholds.find((t) => t.key === `${personId}:bp_systolic`)) : null
  return (
    <>
      <LargeTitle back={{ href: '#health', label: 'Health' }} title="Readings" actions={onAdd ? <button type="button" className="hv-tl" onClick={onAdd}>Add</button> : undefined} />
      <WhoLine />
      {saved && <p className="sub" role="status" style={{ margin: '0 4px' }}>{saved}</p>}
      {!ready && (
        <section className="hv-load" aria-busy="true" aria-label="Readings" data-testid="health-loading">
          <span className="hv-sr">Loading</span>
          <Skeleton lines={3} />
        </section>
      )}
      {ready && personId && (
        <>
          <ReadingsHero readings={readings} thresholds={thresholds} personId={personId} onAdd={onAdd} />
          <Kpis personId={personId} readings={readings} thresholds={thresholds} />
          <Section title="7-day averages" testId="rd-averages">
            <GroupedList icons>
              {nodes.map((n) => (
                <Row key={n.id} testId={`node-${n.id}`} icon={ICON[n.id]} tint={TINT[n.id]} title={n.label} sub={n.empty ? UNIT_WORD[n.id] : [UNIT_WORD[n.id], n.when, n.sub].filter(Boolean).join(' · ')}
                  value={n.empty ? 'None this week' : n.value} href={`#health/metric/${n.code}`} />
              ))}
            </GroupedList>
          </Section>
          <Section title="Where the range comes from" testId="rd-source">
            <div className="card rd-src">
              <b>{src?.kind === 'doctor' ? 'Your doctor\u2019s target' : src?.kind === 'lab' ? 'Lab range' : 'Healthy range'}</b>
              <span className="sub">{src && src.kind !== 'guide' ? src.text : `Based on common adult guides (${GUIDE.bp_systolic?.source ?? 'WHO'}). Your doctor sets yours.`}</span>
            </div>
          </Section>
          <LatestList readings={readings} thresholds={thresholds} />
          <Section title="Tips" testId="rd-tips">
            <a className="btn2" href={MORE_INFO.url} target="_blank" rel="noreferrer" data-testid="readings-tips">{MORE_INFO.text}<span className="hv-sr"> (opens in new tab)</span></a>
          </Section>
        </>
      )}
      {adding && personId && spec && <AddReadingSheet spec={spec} personId={personId} forName={properName(people.find((p) => p.id === personId)?.name ?? '')} bpDoctor={bpDoctorOf(thresholds, personId)} onClose={() => setAdding(false)} onSaved={(m) => { setSaved(m); reload() }} />}
    </>
  )
}
