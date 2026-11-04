import { useEffect, useMemo, useState } from 'react'
import ExploreScreen from '../features/anatomy/ExploreScreen'
import ReadingsPage from '../features/health/ReadingsPage'
import { WhoLine } from '../features/health/WhoLine'
import { Medicines, YourLists } from '../features/health/Medicines'
import MetricScreen from '../features/health/MetricScreen'
import type { NodeId } from '../features/health/model'
import type { IconName } from '../features/shell/Icon'
import { latestByTest } from '../features/health/ranges'
import { MemberHealth } from '../features/health/MemberHealth'
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
import { AttentionHero } from '../features/health/AttentionHero'
import { pickAttention } from '../features/health/attention'
import { PersonSwitcher } from '../features/health/PersonSwitcher'
import { useActingPersonId } from '../features/viewas/viewAs'
import { FamilyHealthCard } from '../features/health/FamilyHealthCard'
import { ForYou } from '../features/health/ForYou'
import { PinnedTiles } from '../features/health/PinnedTiles'
import { HealthBrowse } from '../features/health/HealthBrowse'
import { useHealthPerson } from '../features/health/useHealthPerson'
import { LargeTitle, Section, Skeleton } from '../features/look'
import { HeadActions } from '../features/shell/HeadActions'
import '../features/health/health.css'
import { properName } from '../features/health/medName'
import NudgeHub from '../features/nudge/NudgeHub'

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
  useEffect(() => { if (ready && meId && personId !== meId) setPersonId(meId) }, [ready, meId, personId, setPersonId]) // someone else's page is reached only by the switcher
  return (
    <>
      <LargeTitle kicker="Summary" title="Health" actions={<HeadActions><PersonSwitcher people={people} meId={meId} personId={personId} setPersonId={setPersonId} /></HeadActions>} />
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
      {ready && personId && <FamilyHealthCard ids={people.map((p) => p.id)} />}
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

/** Health > Medicines: one person's medicines (Today, Active, Paused, Past) and the door to Refills. The person is the one chosen on the Health root (H6). */
function MedsPage() {
  const { ownId, personId, canMark, canEdit } = useHealthPerson()
  return (
    <>
      <LargeTitle back={{ href: '#health', label: 'Health' }} title="Medicines" />
      <WhoLine />
      {personId && <Medicines personId={personId} mine={personId === ownId} canMark={canMark} canEdit={canEdit} />}
      {personId && <YourLists personId={personId} />}
    </>
  )
}
