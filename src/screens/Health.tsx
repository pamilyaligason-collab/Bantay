import { useEffect, useMemo, useState } from 'react'
import ExploreScreen from '../features/anatomy/ExploreScreen'
import { LatestList } from '../features/health/LatestList'
import { Medicines } from '../features/health/Medicines'
import MetricScreen from '../features/health/MetricScreen'
import type { NodeId } from '../features/health/model'
import type { IconName } from '../features/shell/Icon'
import { latestByTest } from '../features/health/ranges'
import { MemberHealth } from '../features/health/MemberHealth'
import { Kpis } from '../features/health/Kpis'
import { ReadingsHero } from '../features/health/ReadingsHero'
import { MORE_INFO } from '../features/health/model'
import AddReadingSheet from '../features/health/AddReadingSheet'
import { entrySpec } from '../features/health/readingPreview'
import { bpDoctorOf } from '../features/health/verdict'
import MoveScreen from '../features/exercise/MoveScreen'
import NutritionScreen from '../features/nutrition/NutritionScreen'
import Refill from '../features/health/Refill'
import LabsScreen from '../features/health/LabsScreen'
import MedDetail from '../features/health/MedDetail'
import Visits from '../features/health/Visits'
import VisitSummary from '../features/health/VisitSummary'
import { averageNodes } from '../features/health/vitals'
import { AttentionHero } from '../features/health/AttentionHero'
import { pickAttention } from '../features/health/attention'
import { PersonSwitcher } from '../features/health/PersonSwitcher'
import { useActingPersonId } from '../features/viewas/viewAs'
import { FamilyHealthCard } from '../features/health/FamilyHealthCard'
import { ForYou } from '../features/health/ForYou'
import { PinnedTiles } from '../features/health/PinnedTiles'
import { HealthBrowse } from '../features/health/HealthBrowse'
import { useHealthPerson } from '../features/health/useHealthPerson'
import { LargeTitle, Row, Section, Skeleton } from '../features/look'
import { useActivity } from '../features/health/useActivity'
import '../features/health/health.css'
import { SubHeader } from '../features/shell/SubHeader'
import { PersonChips } from '../features/records/PersonChips'
import { properName } from '../features/health/medName'
import NudgeHub from '../features/nudge/NudgeHub'

const NO_DRAFTS: Record<string, number> = {}
const METRIC = /^#health\/metric\/([\w-]+)$/
const MEMBER = /^#health\/member\/([\w-]+)$/
const MED = /^#health\/med\/([\w-]+)$/ // session 13: medicine detail (lane M); #health/labs is lane L's labs screen

export default function Health() {
  const [hash, setHash] = useState(location.hash)
  useEffect(() => {
    const on = () => setHash(location.hash)
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  const code = METRIC.exec(hash)?.[1]
  const medId = MED.exec(hash)?.[1]
  const memberId = MEMBER.exec(hash)?.[1]
  if (hash === '#health/labs') return <LabsScreen />
  if (memberId) return <MemberHealth id={memberId} />
  if (medId) return <MedDetail medicationId={medId} />
  if (hash === '#health/body') return <ExploreScreen />
  if (hash === '#health/meds') return <MedsPage />
  if (hash === '#health/readings') return <ReadingsPage />
  if (hash === '#health/move') return <MoveScreen />
  if (hash === '#health/nutrition') return <NutritionScreen />
  if (hash === '#health/refill') return <Refill />
  if (hash === '#health/visits') return <Visits />
  if (hash === '#health/summary') return <VisitSummary />
  if (hash === '#health/nudge') return <NudgeHub />
  return code ? <MetricScreen code={code} /> : <Overview />
}

function Overview() {
  const { ready, people, ownId, personId, setPersonId, readings, thresholds, reload, canMark: canLog, canEdit, lockReason, acting } = useHealthPerson()
  const actingId = useActingPersonId()
  const meId = (acting ? actingId : ownId) ?? ''
  const [adding, setAdding] = useState<'bp' | 'fasting_glucose' | null>(null)
  const [saved, setSaved] = useState('')
  const latest = latestByTest(readings)
  const familyOf = (r: { personId: string; test: string }) => thresholds.find((t) => t.key === `${r.personId}:${r.test}`)
  const attention = useMemo(() => pickAttention(latest, familyOf, new Date()), [readings, thresholds]) // eslint-disable-line react-hooks/exhaustive-deps
  const name = properName(people.find((p) => p.id === personId)?.name ?? '')
  useEffect(() => { // someone else's health is their own view-only page
    const to = `#health/member/${personId}`
    if (ready && meId && personId && personId !== meId && location.hash !== to) location.replace(to)
  }, [ready, meId, personId])
  return (
    <>
      <LargeTitle kicker="Summary" title="Health" actions={<PersonSwitcher people={people} meId={meId} personId={personId} setPersonId={setPersonId} />} />
      {!ready && (
        <section className="hv-load" aria-busy="true" aria-label="Health" data-testid="health-loading">
          <span className="hv-sr">Loading</span>
          <Skeleton lines={3} />
          <Skeleton lines={4} />
        </section>
      )}
      {saved && <p className="sub" role="status" style={{ margin: '0 4px' }}>{saved}</p>}
      {ready && (
        <Section title="Needs attention">
          <AttentionHero attention={attention} family={attention ? familyOf(attention.reading) : undefined} canLog={canLog} canEdit={canEdit} lockReason={lockReason} onAdd={() => setAdding('bp')} />
        </Section>
      )}
      {ready && personId && <PinnedTiles personId={personId} readings={readings} />}
      {ready && personId && <FamilyHealthCard />}
      {ready && personId && <HealthBrowse personId={personId} readings={readings} thresholds={thresholds} />}
      {ready && personId && <ForYou personId={personId} readings={readings} attention={attention} canLog={canLog} onAdd={setAdding} />}
      {adding && personId && (() => {
        const spec = entrySpec(adding === 'bp' ? 'bp_systolic' : adding)
        return spec ? <AddReadingSheet spec={spec} personId={personId} forName={name} family={spec.kind === 'bp' ? undefined : thresholds.find((t) => t.key === `${personId}:${spec.code}`)} bpDoctor={spec.kind === 'bp' ? bpDoctorOf(thresholds, personId) : undefined} onClose={() => setAdding(null)} onSaved={(m) => { setSaved(m); reload() }} /> : null
      })()}
    </>
  )
}

/** One glyph per measure (ICON-JACK-AUDIT rule 5): BP = gauge, Sugar = drop. */
export const NODE_ICON: Record<NodeId, IconName> = { sleep: 'moon', mood: 'smile', bp: 'gauge', pulse: 'heart', sugar: 'drop', weight: 'scale', steps: 'walk' }

/** Health > Readings: all seven numbers (sleep, mood and steps included), My numbers (latest per measure) and Latest | Average | Normal. The doors from the body hero and More in Health land here. */
function ReadingsPage() {
  const { ready, people, ownId, personId, setPersonId, readings, thresholds, canMark, reload } = useHealthPerson()
  const acts = useActivity(personId)
  const [adding, setAdding] = useState(false)
  const [saved, setSaved] = useState('')
  const familyOf = (r: { personId: string; test: string }) => thresholds.find((t) => t.key === `${r.personId}:${r.test}`)
  const nodes = useMemo(() => averageNodes(readings, acts, new Date(), familyOf), [readings, acts, thresholds]) // eslint-disable-line react-hooks/exhaustive-deps
  const spec = entrySpec('bp_systolic')
  return (
    <>
      <LargeTitle back={{ href: '#health', label: 'Health' }} title="Readings" actions={canMark && spec ? <button type="button" className="btn" onClick={() => setAdding(true)}>Add</button> : undefined} />
      <PersonChips people={people} ownId={ownId} personId={personId} drafts={NO_DRAFTS} onPick={setPersonId} />
      {saved && <p className="sub" role="status" style={{ margin: '0 4px' }}>{saved}</p>}
      {ready && personId && (
        <>
          <ReadingsHero readings={readings} thresholds={thresholds} personId={personId} />
          <Kpis personId={personId} readings={readings} thresholds={thresholds} />
          <section aria-labelledby="rd-h" data-testid="seven">
            <h2 className="hd" id="rd-h">7-day averages</h2>
            <div className="rd-list">
              {nodes.map((n) => <Row key={n.id} icon={NODE_ICON[n.id]} title={`${n.label} ${n.value}`} sub={n.note} href={`#health/metric/${n.code}`} testId={`node-${n.id}`} />)}
            </div>
          </section>
          <LatestList readings={readings} thresholds={thresholds} ready={ready} onAdd={canMark ? () => setAdding(true) : undefined} />
          <a className="btn" href={MORE_INFO.url} target="_blank" rel="noreferrer" data-testid="readings-tips" style={{ marginTop: 12 }}>{MORE_INFO.text}<span className="hv-sr"> (opens in new tab)</span></a>
        </>
      )}
      {adding && personId && spec && <AddReadingSheet spec={spec} personId={personId} forName={properName(people.find((p) => p.id === personId)?.name ?? '')} bpDoctor={bpDoctorOf(thresholds, personId)} onClose={() => setAdding(false)} onSaved={(m) => { setSaved(m); reload() }} />}
    </>
  )
}

/** Health > Medicines: the person chips, then one person's medicines (Today, Active, Paused, Past), and the door to Refills. */
function MedsPage() {
  const { people, ownId, personId, setPersonId, canMark, canEdit } = useHealthPerson()
  const name = people.find((p) => p.id === personId)?.name ?? ''
  return (
    <>
      <SubHeader title="Medicines" backHref="#health" backLabel="Back to Health" />
      <PersonChips people={people} ownId={ownId} personId={personId} drafts={NO_DRAFTS} onPick={setPersonId} />
      {name && <p className="who-chip"><span className="who-av" aria-hidden="true">{name.charAt(0).toUpperCase()}</span><span>{name}</span></p>}
      {personId && <Medicines personId={personId} mine={personId === ownId} canMark={canMark} canEdit={canEdit} />}
      <Row icon="clock" title="Refills" sub="Days of medicine left" href="#health/refill" testId="refills-door" />
    </>
  )
}

