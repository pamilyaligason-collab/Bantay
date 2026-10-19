import { useMemo, useState } from 'react'
import { useKv } from '../safety/store'
import { logMedTaken } from '../log/store'
import { useProfile } from '../setup/useProfile'
import { useConfirmedMedicines } from '../records/useRecordsServer'
import { clock, doseStates, medSlots, sameName, type Slot } from './model'
import { useTakenToday } from './useActivity'

const NO_NAMES: string[] = []
type Row = Slot & { taken: boolean; detail: string; first: boolean }

/** Medicines today: the profile list (entries may carry times) plus confirmed prescription lines.
 *  Only the person themself can tick "Taken": the server accepts a dose from them, not from every viewer. */
export function Medicines({ personId, mine }: { personId: string; mine: boolean }) {
  const profile = useProfile(personId)
  const own = useKv<string[]>('profile.medicines', NO_NAMES) // offline cache of the signed-in person's own list
  const rx = useConfirmedMedicines(personId)
  const taken = useTakenToday(personId)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const entries = profile?.medicines?.length ? profile.medicines : mine ? own : NO_NAMES

  const rows = useMemo<Row[]>(() => {
    const slots = medSlots(entries)
    const detail = new Map<string, string>()
    const extra: Slot[] = []
    for (const i of rx ?? []) {
      const name = i.drug_raw?.trim()
      if (!name) continue
      const d = [i.strength, i.dose, i.frequency].filter(Boolean).join(' · ')
      const hit = slots.find((s) => sameName(s.name, name) || name.toLowerCase().startsWith(`${s.name.toLowerCase()} `))
      if (hit) { if (d && !detail.has(hit.name.toLowerCase())) detail.set(hit.name.toLowerCase(), d) }
      else if (!extra.some((s) => sameName(s.name, name))) { extra.push({ name, at: null }); if (d) detail.set(name.toLowerCase(), d) }
    }
    const seen = new Set<string>()
    return doseStates([...slots, ...extra], taken, new Date()).map((s) => {
      const k = s.name.toLowerCase()
      const first = !s.taken && !seen.has(k)
      if (!s.taken) seen.add(k)
      return { ...s, detail: detail.get(k) ?? '', first }
    })
  }, [entries, rx, taken])

  const take = async (name: string) => {
    if (busy) return
    setBusy(true)
    setErr('')
    try { await logMedTaken({ personId, name, takenAt: new Date().toISOString() }) } catch { setErr('Could not save on this phone. Try again.') }
    setBusy(false)
  }

  return (
    <section aria-labelledby="hv-med">
      <h2 className="hd" id="hv-med">Medicines today</h2>
      {rows.length === 0 ? (
        <div className="grp">
          <div className="row">
            <span className="grow">
              No medicines yet
              <span className="sub">Add them in Me, or confirm a prescription in Family &gt; Records.</span>
            </span>
          </div>
        </div>
      ) : (
        <div className="grp" data-testid="meds-today">
          {rows.map((r, i) => (
            <div className="row" key={`${r.name}:${r.at ?? 'x'}:${i}`} data-med={r.name}>
              <span className="grow">
                <span>{r.name}</span>
                <span className="sub">{[r.at != null ? clock(r.at) : 'Any time today', r.detail].filter(Boolean).join(' · ')}</span>
              </span>
              {r.taken ? (
                <span className="hv-done"><svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg> Taken</span>
              ) : mine && r.first ? (
                <button type="button" className="hv-take" disabled={busy} aria-label={`Mark ${r.name}${r.at != null ? ` ${clock(r.at)}` : ''} as taken`} onClick={() => void take(r.name)}>Mark taken</button>
              ) : (
                <span className="sub">{mine ? 'Later today' : 'Not yet'}</span>
              )}
            </div>
          ))}
        </div>
      )}
      {err && <p className="sub" role="alert" style={{ margin: '8px 4px 0', color: 'var(--red)' }}>{err}</p>}
      {mine && rows.some((r) => r.at != null) && <p className="sub" style={{ margin: '8px 4px 0' }}>On Android, a reminder rings at each time you added, once reminders are allowed for this phone.</p>}
    </section>
  )
}
