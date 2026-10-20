import { useEffect, useMemo, useRef, useState } from 'react'
import Avatar from '../features/admin/Avatar'
import '../features/admin/admin.css'
import ExploreScreen from '../features/anatomy/ExploreScreen'
import { BodyMap } from '../features/health/BodyMap'
import { LatestList } from '../features/health/LatestList'
import { Medicines, MedicinesSummary } from '../features/health/Medicines'
import { canMarkFor, useWritableIds } from '../features/health/useCanMark'
import MetricScreen from '../features/health/MetricScreen'
import { bodyNodes, insightHeadline } from '../features/health/model'
import { latestByTest } from '../features/health/ranges'
import { useActivity } from '../features/health/useActivity'
import '../features/health/health.css'
import { PersonChips } from '../features/records/PersonChips'
import { useHealthData } from '../features/records/useHealthData'
import { loadAll } from '../features/records/store'
import { useProfile } from '../features/setup/useProfile'

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
  return code ? <MetricScreen code={code} /> : <Overview />
}

function Overview() {
  const { ready, people, ownId, personId, setPersonId, readings, thresholds } = useHealthData()
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
  const profile = useProfile(personId)
  const latest = latestByTest(readings)
  const name = people.find((p) => p.id === personId)?.name ?? ''
  const familyOf = (r: { personId: string; test: string }) => thresholds.find((t) => t.key === `${r.personId}:${r.test}`)
  const raw = insightHeadline(latest, new Date(), familyOf)
  const head = raw
  const nodes = useMemo(() => bodyNodes(readings, acts, new Date(), familyOf), [readings, acts, thresholds]) // eslint-disable-line react-hooks/exhaustive-deps
  const blank = ready && readings.length === 0 && nodes.every((n) => n.empty)
  const cta = personId && personId === ownId ? { href: '#today', label: 'Log a reading' } : { href: '#records', label: 'Confirm records' }
  return (
    <>
      <div className="hdr">
        <h1>Health</h1>
        <span>{name ? (personId === ownId ? 'My health, in one place' : `${name.split(' ')[0]}'s health, in one place`) : 'Your health, in one place'}</span>
      </div>
      <PersonChips people={people} ownId={ownId} personId={personId} drafts={NO_DRAFTS} onPick={pick} />
      {ready && (
        <div className="hv-head" data-tone={head.tone}>
          <div className="grow">
            <h2 className="hv-insight" data-testid="insight">{head.title}</h2>
            <p className="sub hv-sub">{head.sub}</p>
          </div>
          {name && <Avatar name={name} photoPath={profile?.photoPath} size={72} />}
        </div>
      )}
      {ready && !blank && nodes.every((n) => n.empty) ? (
        <div className="card hv-novitals" data-testid="no-vitals">
          <h2 className="hv-nv-h">No vitals yet{name ? ` for ${name.split(' ')[0]}` : ''}</h2>
          <p className="sub">Blood pressure, sugar, weight and steps show here once they are logged.</p>
          <a className="hv-cta" href={cta.href}>{cta.label}</a>
        </div>
      ) : (
        <BodyMap nodes={nodes} cta={blank ? cta : undefined} />
      )}
      <a className="card hv-explore" href="#health/body">
        <span>Explore your body<small>See how each part works and when to see a doctor</small></span>
      </a>
      {!blank && <LatestList readings={readings} thresholds={thresholds} ready={ready} />}
      {personId && <MedicinesSummary personId={personId} />}
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
      <div className="hdr hv-back-row">
        <a className="hv-back" href="#health" aria-label="Back to Health"><svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg></a>
        <h1>Medicines</h1>
      </div>
      <PersonChips people={people} ownId={ownId} personId={personId} drafts={NO_DRAFTS} onPick={setPersonId} />
      {name && <p className="sub" style={{ margin: '4px 4px 0' }}>Showing: <b style={{ color: 'var(--ink)' }}>{name}</b></p>}
      {personId && <Medicines personId={personId} mine={personId === ownId} canMark={canMark} canEdit={canEdit} />}
    </>
  )
}
