import { useEffect, useMemo, useRef, useState } from 'react'
import ExploreScreen from '../features/anatomy/ExploreScreen'
import { LatestList } from '../features/health/LatestList'
import { Medicines } from '../features/health/Medicines'
import MetricScreen from '../features/health/MetricScreen'
import { insightHeadline } from '../features/health/model'
import { latestByTest } from '../features/health/ranges'
import { Kpis } from '../features/health/Kpis'
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
import { BodyHero } from '../features/health/BodyHero'
import { GlanceGrid, NudgeRow } from '../features/health/GlanceGrid'
import { HealthBrowse } from '../features/health/HealthBrowse'
import { useHealthPerson } from '../features/health/useHealthPerson'
import { Row, Skeleton } from '../features/look'
import { useActivity } from '../features/health/useActivity'
import '../features/health/health.css'
import { SubHeader } from '../features/shell/SubHeader'
import { PersonChips } from '../features/records/PersonChips'
import { loadAll } from '../features/records/store'
import { properName } from '../features/health/medName'
import NudgeHub from '../features/nudge/NudgeHub'

const NO_DRAFTS: Record<string, number> = {}
const METRIC = /^#health\/metric\/([\w-]+)$/
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
  if (hash === '#health/labs') return <LabsScreen />
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
  const { ready, people, ownId, personId, setPersonId, readings, thresholds, reload, canMark: canLog, canEdit, acting, lockReason } = useHealthPerson()
  const [adding, setAdding] = useState<'bp' | 'fasting_glucose' | null>(null)
  const [saved, setSaved] = useState('')
  const acts = useActivity(personId)
  // Default person: the signed-in user; with nobody signed in, the first person who has readings (not just the first name). A tap on a chip wins.
  const picked = useRef(false)
  useEffect(() => {
    if (!ready || picked.current || ownId || acting || readings.length > 0) return
    let live = true
    void loadAll().then((d) => {
      const withData = d.people.find((p) => d.readings.some((r) => r.personId === p.id)) ?? null
      if (live && !picked.current && withData) setPersonId(withData.id)
    }).catch(() => {})
    return () => { live = false }
  }, [ready, ownId, acting, readings.length, setPersonId])
  const pick = (id: string) => { picked.current = true; setPersonId(id) }
  const latest = latestByTest(readings)
  const familyOf = (r: { personId: string; test: string }) => thresholds.find((t) => t.key === `${r.personId}:${r.test}`)
  const head = insightHeadline(latest, new Date(), familyOf)
  const nodes = useMemo(() => averageNodes(readings, acts, new Date(), familyOf), [readings, acts, thresholds]) // eslint-disable-line react-hooks/exhaustive-deps
  const blank = ready && nodes.every((n) => n.empty)
  const name = properName(people.find((p) => p.id === personId)?.name ?? '')
  const showHead = ready && readings.length > 0 && (!blank || head.tone === 'watch') // labs-only: only a lab out of range warns
  return (
    <>
      <div className="hdr">
        <h1>Health</h1>
      </div>
      <PersonChips people={people} ownId={ownId} personId={personId} drafts={NO_DRAFTS} onPick={pick} />
      {!ready && (
        <section className="hv-load" aria-busy="true" aria-label="Health" data-testid="health-loading">
          <span className="hv-sr">Loading</span>
          <Skeleton lines={3} />
          <Skeleton lines={4} />
        </section>
      )}
      {showHead && <p className={`hv-insight2${head.tone === 'watch' ? ' watch' : ''}`} data-testid="insight">{head.title}</p>}
      {saved && <p className="sub" role="status" style={{ margin: '0 4px' }}>{saved}</p>}
      {ready && <BodyHero nodes={nodes} blank={blank} canLog={canLog} canEdit={canEdit} onAdd={() => setAdding('bp')} lockReason={lockReason ?? undefined} />}
      {ready && personId && readings.length > 0 && <GlanceGrid personId={personId} readings={readings} thresholds={thresholds} />}
      {ready && personId && !blank && <NudgeRow personId={personId} readings={readings} canLog={canLog} onAdd={setAdding} />}
      {ready && personId && <HealthBrowse personId={personId} />}
      {adding && personId && (() => {
        const spec = entrySpec(adding === 'bp' ? 'bp_systolic' : adding)
        return spec ? <AddReadingSheet spec={spec} personId={personId} forName={name} family={spec.kind === 'bp' ? undefined : thresholds.find((t) => t.key === `${personId}:${spec.code}`)} bpDoctor={spec.kind === 'bp' ? bpDoctorOf(thresholds, personId) : undefined} onClose={() => setAdding(null)} onSaved={(m) => { setSaved(m); reload() }} /> : null
      })()}
    </>
  )
}

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
      <SubHeader title="Readings" backHref="#health" backLabel="Back to Health" />
      <PersonChips people={people} ownId={ownId} personId={personId} drafts={NO_DRAFTS} onPick={setPersonId} />
      {saved && <p className="sub" role="status" style={{ margin: '0 4px' }}>{saved}</p>}
      {ready && personId && (
        <>
          <section aria-labelledby="rd-h" data-testid="seven">
            <h2 className="hd" id="rd-h">7-day averages</h2>
            <div className="rd-list">
              {nodes.map((n) => <Row key={n.id} icon="gauge" title={`${n.label} ${n.value}`} sub={n.note} href={`#health/metric/${n.code}`} testId={`node-${n.id}`} />)}
            </div>
          </section>
          <Kpis personId={personId} readings={readings} thresholds={thresholds} />
          <LatestList readings={readings} thresholds={thresholds} ready={ready} onAdd={canMark ? () => setAdding(true) : undefined} />
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

