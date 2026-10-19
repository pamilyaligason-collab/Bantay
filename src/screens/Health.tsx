import { useEffect, useMemo, useRef, useState } from 'react'
import Avatar from '../features/admin/Avatar'
import '../features/admin/admin.css'
import ExploreScreen from '../features/anatomy/ExploreScreen'
import { BodyMap } from '../features/health/BodyMap'
import { LatestList } from '../features/health/LatestList'
import { Medicines } from '../features/health/Medicines'
import MetricScreen from '../features/health/MetricScreen'
import { bodyNodes, insightHeadline } from '../features/health/model'
import { latestByTest } from '../features/health/ranges'
import { syncDoseReminders } from '../features/health/reminders'
import { useActivity } from '../features/health/useActivity'
import '../features/health/health.css'
import { PersonChips } from '../features/records/PersonChips'
import { useHealthData } from '../features/records/useHealthData'
import { loadAll } from '../features/records/store'
import { useKv } from '../features/shell/useKv'
import { useProfile } from '../features/setup/useProfile'

const NO_DRAFTS: Record<string, number> = {}
const NO_NAMES: string[] = []
const METRIC = /^#health\/metric\/([\w-]+)$/

export default function Health() {
  const [hash, setHash] = useState(location.hash)
  useEffect(() => {
    const on = () => setHash(location.hash)
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  // Daily dose reminders follow the signed-in person's own medicine list, whichever person is on screen.
  const [ownMeds, , medsLoaded] = useKv<string[]>('profile.medicines', NO_NAMES)
  useEffect(() => { if (medsLoaded) void syncDoseReminders(ownMeds) }, [ownMeds, medsLoaded]) // not before kv loads: an empty first pass would cancel every reminder
  const code = METRIC.exec(hash)?.[1]
  if (hash === '#health/body') return <ExploreScreen />
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
        <span>{name ? `${personId === ownId ? 'Me' : name.split(' ')[0]} · your health, in one place` : 'Your health, in one place'}</span>
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
      <BodyMap nodes={nodes} cta={blank ? cta : undefined} />
      <a className="card hv-explore" href="#health/body">
        <span>Explore your body<small>See how each part works and when to see a doctor</small></span>
      </a>
      {!blank && <LatestList readings={readings} thresholds={thresholds} ready={ready} />}
      {personId && <Medicines personId={personId} mine={personId === ownId} />}
    </>
  )
}
