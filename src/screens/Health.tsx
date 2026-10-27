import { useEffect, useMemo, useRef, useState } from 'react'
import ExploreScreen from '../features/anatomy/ExploreScreen'
import { BodyMap } from '../features/health/BodyMap'
import { LabsList } from '../features/health/LabsList'
import { LatestList } from '../features/health/LatestList'
import { Medicines, MedicinesSummary } from '../features/health/Medicines'
import { canMarkFor, useWritableIds } from '../features/health/useCanMark'
import MetricScreen from '../features/health/MetricScreen'
import { insightHeadline } from '../features/health/model'
import { latestByTest } from '../features/health/ranges'
import { Kpis } from '../features/health/Kpis'
import { NudgeCard } from '../features/health/NudgeCard'
import AddReadingSheet from '../features/health/AddReadingSheet'
import { entrySpec } from '../features/health/readingPreview'
import { bpDoctorOf } from '../features/health/verdict'
import { HealthLinks } from '../features/health/HealthLinks'
import Library from '../features/health/library/Library'
import Article from '../features/health/library/Article'
import Videos from '../features/health/library/Videos'
import MoveScreen from '../features/exercise/MoveScreen'
import NutritionScreen from '../features/nutrition/NutritionScreen'
import Refill from '../features/health/Refill'
import Visits from '../features/health/Visits'
import VisitSummary from '../features/health/VisitSummary'
import { averageNodes } from '../features/health/vitals'
import { useActivity } from '../features/health/useActivity'
import '../features/health/health.css'
import { Icon } from '../features/shell/Icon'
import { SubHeader } from '../features/shell/SubHeader'
import Records from './Records'
import { PersonChips } from '../features/records/PersonChips'
import { useHealthData } from '../features/records/useHealthData'
import { loadAll } from '../features/records/store'
import { givenName, properName } from '../features/health/medName'

const safeDecode = (s: string) => { try { return decodeURIComponent(s) } catch { return s } }
const NO_DRAFTS: Record<string, number> = {}
const METRIC = /^#health\/metric\/([\w-]+)$/

export default function Health() {
  const [hash, setHash] = useState(location.hash)
  useEffect(() => {
    const on = () => setHash(location.hash)
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  const code = METRIC.exec(hash)?.[1]
  if (hash === '#health/body') return <ExploreScreen />
  if (hash === '#health/meds') return <MedsPage />
  if (hash === '#health/papers') return <Papers />
  if (hash === '#health/library') return <Library />
  if (hash === '#health/videos') return <Videos />
  if (hash.startsWith('#health/library/')) return <Article rawKey={safeDecode(hash.slice('#health/library/'.length))} />
  if (hash === '#health/move') return <MoveScreen />
  if (hash === '#health/nutrition') return <NutritionScreen />
  if (hash === '#health/refill') return <Refill />
  if (hash === '#health/visits') return <Visits />
  if (hash === '#health/summary') return <VisitSummary />
  return code ? <MetricScreen code={code} /> : <Overview />
}

function Overview() {
  const { ready, people, member, ownId, personId, setPersonId, readings, thresholds, reload } = useHealthData()
  const writable = useWritableIds(member?.userId)
  const [adding, setAdding] = useState<'bp' | 'fasting_glucose' | null>(null)
  const [saved, setSaved] = useState('')
  const acts = useActivity(personId)
  // Default person: the signed-in user; with nobody signed in, the first person who has readings (not just the first name). A tap on a chip wins.
  const picked = useRef(false)
  useEffect(() => {
    if (!ready || picked.current || ownId || readings.length > 0) return
    let live = true
    void loadAll().then((d) => {
      const withData = d.people.find((p) => d.readings.some((r) => r.personId === p.id)) ?? null
      if (live && !picked.current && withData) setPersonId(withData.id)
    }).catch(() => {})
    return () => { live = false }
  }, [ready, ownId, readings.length, setPersonId])
  const pick = (id: string) => { picked.current = true; setPersonId(id) }
  const latest = latestByTest(readings)
  const name = properName(people.find((p) => p.id === personId)?.name ?? '')
  const familyOf = (r: { personId: string; test: string }) => thresholds.find((t) => t.key === `${r.personId}:${r.test}`)
  const raw = insightHeadline(latest, new Date(), familyOf)
  const head = raw
  const nodes = useMemo(() => averageNodes(readings, acts, new Date(), familyOf), [readings, acts, thresholds]) // eslint-disable-line react-hooks/exhaustive-deps
  const blank = ready && readings.length === 0 && nodes.every((n) => n.empty)
  const noVitals = ready && nodes.every((n) => n.empty) // S6: readings but no vitals: ONE empty state (the no-vitals card), no headline or nudge above it. No readings at all keeps the figure + headline
  const cta = personId && personId === ownId ? { href: '#today', label: 'Log a reading' } : { href: '#health/papers', label: 'Confirm records' }
  return (
    <>
      <div className="hdr">
        <h1>Health</h1>
      </div>
      <PersonChips people={people} ownId={ownId} personId={personId} drafts={NO_DRAFTS} onPick={pick} />
      {name && <p className="sub" style={{ margin: '4px 4px 0' }} data-testid="showing">Showing: <b style={{ color: 'var(--ink)' }}>{name}</b></p>}
      {ready && !(noVitals && !blank && head.tone !== 'watch') && ( // a lab out of range this week still warns above the no-vitals card
        <div className="hv-head" data-tone={head.tone}>
          <div className="grow">
            <h2 className="hv-insight" data-testid="insight">{head.title}</h2>
            <p className="sub hv-sub">{head.sub}</p>
          </div>
        </div>
      )}
      {ready && !(noVitals && !blank) && personId && <NudgeCard personId={personId} readings={readings} canLog={canMarkFor(personId, ownId, writable)} onAdd={setAdding} />}
      {saved && <p className="sub" role="status" style={{ margin: '0 4px' }}>{saved}</p>}
      {personId && <Kpis personId={personId} readings={readings} thresholds={thresholds} />}
      {ready && !blank && noVitals ? (
        <div className="card hv-novitals" data-testid="no-vitals">
          <h2 className="hv-nv-h">No vitals yet{name ? ` for ${givenName(name)}` : ''}</h2>
          <p className="sub">Blood pressure, sugar, weight and steps show here once they are logged. Lab results are below.</p>
          <a className="hv-cta" href={cta.href}>{cta.label}</a>
        </div>
      ) : (
        <>
          <BodyMap nodes={nodes} cta={blank ? cta : undefined} />
          {!blank && <p className="sub hv-avgnote" data-testid="avg-note">7-day average on the body map. Tap a part to explore it; the latest readings are in My numbers.</p>}
        </>
      )}
      <a className="card hv-explore" href="#health/body">
        <Icon name="lungs" tone="vitals" boxed />
        <span className="grow">Explore your body<small>See how each part works and when to see a doctor</small></span>
        <Icon name="chev" size={20} />
      </a>
      <a className="card hv-explore" href="#health/move">
        <Icon name="move" tone="vitals" boxed />
        <span className="grow">Move<small>Gentle exercise picks for today and your week</small></span>
        <Icon name="chev" size={20} />
      </a>
      <a className="card hv-explore" href="#health/nutrition">
        <Icon name="salt" tone="vitals" boxed />
        <span className="grow">Food and nutrients<small>Meals, salt and nutrients, next to blood pressure</small></span>
        <Icon name="chev" size={20} />
      </a>
      {personId && <MedicinesSummary personId={personId} />}
      {!blank && <LatestList readings={readings} thresholds={thresholds} ready={ready} />}
      {!blank && <LabsList readings={readings} thresholds={thresholds} ready={ready} />}
      {personId && <HealthLinks personId={personId} />}
      {adding && personId && (() => {
        const spec = entrySpec(adding === 'bp' ? 'bp_systolic' : adding)
        return spec ? <AddReadingSheet spec={spec} personId={personId} forName={name} family={spec.kind === 'bp' ? undefined : thresholds.find((t) => t.key === `${personId}:${spec.code}`)} bpDoctor={spec.kind === 'bp' ? bpDoctorOf(thresholds, personId) : undefined} onClose={() => setAdding(null)} onSaved={(m) => { setSaved(m); reload() }} /> : null
      })()}
    </>
  )
}

/** Health > Medicines: the person chips, then one person's medicines (Today, Active, Paused, Past). */
function MedsPage() {
  const { people, member, ownId, personId, setPersonId } = useHealthData()
  const writable = useWritableIds(member?.userId)
  const name = people.find((p) => p.id === personId)?.name ?? ''
  const canMark = canMarkFor(personId, ownId, writable)
  const canEdit = canMark || member?.role === 'admin' // self, writer carer and admin (records_editor) may edit; only self or a writer carer marks a dose
  return (
    <>
      <SubHeader title="Medicines" backHref="#health" backLabel="Back to Health" />
      <PersonChips people={people} ownId={ownId} personId={personId} drafts={NO_DRAFTS} onPick={setPersonId} />
      {name && <p className="sub" style={{ margin: '4px 4px 0' }}>Showing: <b style={{ color: 'var(--ink)' }}>{name}</b></p>}
      {personId && <Medicines personId={personId} mine={personId === ownId} canMark={canMark} canEdit={canEdit} />}
    </>
  )
}

/** Health > Papers: the old Records screen (trend, timeline, the check queue) under Health. */
function Papers() {
  return (
    <>
      <SubHeader title="Papers" backHref="#health" backLabel="Back to Health" />
      <Records />
    </>
  )
}
