import { liveQuery } from 'dexie'
import { useEffect, useMemo, useState } from 'react'
import { ldb, type MedTaken } from '../log/store'
import { PersonChips } from '../records/PersonChips'
import { SubHeader } from '../shell/SubHeader'
import { useProfile } from '../setup/useProfile'
import { renderSummaryImage, shareSummary } from './summaryImage'
import { useHealthPerson } from './useHealthPerson'
import { useMedications } from './useMedications'
import { buildSummary, SUMMARY_DAYS } from './visitSummary'
import './health.css'
import './m7a.css'

const NO_DRAFTS: Record<string, number> = {}
const NO_TAKES: MedTaken[] = []

/** #health/summary: one page for the doctor, made on this phone. Shared as a picture through the system share sheet (or saved), no server. */
export default function VisitSummary() {
  const { people, ownId, personId, setPersonId, readings } = useHealthPerson()
  const profile = useProfile(personId)
  const meds = useMedications(personId)
  const [takes, setTakes] = useState(NO_TAKES)
  useEffect(() => {
    if (!personId) return setTakes(NO_TAKES)
    const since = new Date(Date.now() - (SUMMARY_DAYS + 1) * 86_400_000).toISOString()
    const sub = liveQuery(() => ldb.meds.where('personId').equals(personId).filter((m) => m.takenAt >= since).toArray()).subscribe({ next: setTakes, error: () => setTakes(NO_TAKES) })
    return () => sub.unsubscribe()
  }, [personId])
  const name = people.find((p) => p.id === personId)?.name ?? ''
  const now = useMemo(() => new Date(), [])
  const s = useMemo(() => buildSummary({
    person: { name: name || 'Patient', birthdate: profile?.birthdate, bloodType: profile?.bloodType, allergies: profile?.allergies, conditions: profile?.conditions },
    readings, meds, takes, personId, now
  }), [name, profile, readings, meds, takes, personId, now])
  const [status, setStatus] = useState('')
  const [dl, setDl] = useState<string | null>(null)
  useEffect(() => () => { if (dl) URL.revokeObjectURL(dl) }, [dl])

  const share = async () => {
    const blob = await renderSummaryImage(s.lines)
    if (!blob) return setStatus('This phone could not make the picture. Use Show full screen and take a screenshot.')
    const r = await shareSummary(blob, s.title)
    if (r === 'shared') return setStatus('Shared.')
    if (r === 'cancelled') return setStatus('')
    setDl(URL.createObjectURL(blob))
    setStatus('Sharing is not available here. Save the picture instead.')
  }

  return (
    <>
      <SubHeader title="Summary for the doctor" backHref="#health/visits" backLabel="Back to Doctor visits" />
      <PersonChips people={people} ownId={ownId} personId={personId} drafts={NO_DRAFTS} onPick={setPersonId} />
      <article className="card vsum" aria-label="Summary page" data-testid="summary">
        <h2 className="vsum-n">{s.who}</h2>
        <p className="sub">{s.madeOn}</p>
        {s.facts.map((f) => <p key={f} className="vsum-f">{f}</p>)}
        <h3>Home readings, last 30 days</h3>
        <p>{s.bp ? `Blood pressure average ${s.bp.text} (${s.bp.n} ${s.bp.n === 1 ? 'reading' : 'readings'}${s.bp.high ? `, ${s.bp.high} above the general guide` : ''})` : 'Blood pressure: no readings'}</p>
        <p>{s.sugar ? `Fasting sugar average ${s.sugar.text} (${s.sugar.n} ${s.sugar.n === 1 ? 'reading' : 'readings'}${s.sugar.high ? `, ${s.sugar.high} above the general guide` : ''})` : 'Fasting sugar: no readings'}</p>
        <h3>Medicines now</h3>
        {s.medicines.length ? <ul>{s.medicines.map((m) => <li key={m}>{m}</li>)}</ul> : <p>None listed</p>}
        <p><b>{s.adherence ? `Doses on time: ${s.adherence.pct}% (${s.adherence.done} of ${s.adherence.want})` : 'Doses on time: not enough data yet'}</b></p>
        <p className="sub">Compiled by the family from this phone. Not a medical device and not medical advice.</p>
      </article>
      <button type="button" className="btn" onClick={() => void share()}>Share as picture</button>
      {dl && <a className="btn2 vs-prep" href={dl} download="visit-summary.png">Save the picture</a>}
      {status && <p className="sub" role="status">{status}</p>}
    </>
  )
}
