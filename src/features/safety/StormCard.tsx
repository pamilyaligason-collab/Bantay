import { useState } from 'react'
import { ALL_IDS } from '../gobag/items'
import { EMPTY as BAG_EMPTY, KEY as BAG_KEY, readState } from '../gobag/state'
import { FAIL_TEXT, feelingToast, type Feeling, logFeeling } from '../today/actions'
import { ALERTS_KEY, type Alert } from './alerts'
import { liveSignals, PAGASA_CREDIT, signalOf, stormTitle } from './stormMode'
import { useKv } from './store'
import './safety.css'

const NONE: Alert[] = []
const FACES: { label: string; feeling: Feeling }[] = [
  { label: 'Great', feeling: 'great' }, { label: 'OK', feeling: 'ok' }, { label: 'Not great', feeling: 'notgreat' }, { label: 'Unwell', feeling: 'unwell' }
]

/** Storm mode (mockup safety-storm, S5; mounted on Today by S7): shows only while PAGASA has a wind signal for a home zone.
 *  The How are you? faces go through logFeeling, the same as Today: Unwell also raises the family alert (raise_mood_alert) on every mount. */
export function StormCard({ now }: { now?: number }) {
  const alerts = useKv<Alert[]>(ALERTS_KEY, NONE)
  const bag = readState(useKv<unknown>(BAG_KEY, BAG_EMPTY))
  const [saved, setSaved] = useState<string | null>(null)
  const top = liveSignals(alerts, now)[0]
  if (!top) return null
  const n = signalOf(top)!
  const answer = async (f: (typeof FACES)[number]) => {
    const r = await logFeeling(f.feeling)
    if (r === 'untold') return setSaved(feelingToast(r))
    if (r !== 'told') return setSaved(FAIL_TEXT[r])
    setSaved(f.feeling === 'unwell' ? 'Saved. Your family can see it in Bantay. If you need help now, hold SOS or call 911.' : 'Saved. Your family can see it in Bantay.')
  }
  return (
    <section className="sf sf-stormcard" aria-label="Storm mode">
      <article className="sf-storm">
        <div className="sf-storm-top">
          <div>
            <div className="sf-storm-eyebrow">{top.source} · {top.when.replace(' PH time', '')}</div>
            <h2 className="sf-storm-h">{stormTitle(top)}</h2>
          </div>
          <div className="sf-signal" role="img" aria-label={`Wind signal number ${n}`}>{n}</div>
        </div>
        <p className="sf-storm-p">{top.what}</p>
        <p className="sf-storm-p">{top.where}</p>
        <div className="sf-storm-links">
          {top.sourceUrl && <a className="sf-storm-a" href={top.sourceUrl} target="_blank" rel="noopener noreferrer">See the source</a>}
          <a className="sf-storm-a" href="#safety/warnings">All warnings</a>
        </div>
        <p className="sf-storm-cr">{PAGASA_CREDIT}</p>
      </article>
      <article className="sf-checkin">
        <h2 className="sf-h2">How are you?</h2>
        <div className="sf-faces" role="group" aria-label="How are you?">
          {FACES.map((f) => <button key={f.label} type="button" className="sf-face" onClick={() => void answer(f)}>{f.label}</button>)}
        </div>
        {saved && <p className="sub" role="status" style={{ margin: 0 }}>{saved}</p>}
        <a className="sf-link" href="#family">See who has checked in</a>
      </article>
      <article className="sf-checkin">
        <h2 className="sf-h2">Do now</h2>
        <ul className="sf-do">
          <li>Charge phones and power banks</li>
          <li><a href="#gobag">Go-bag: {bag.done.length} of {ALL_IDS.length} packed</a></li>
          <li>Keep 7 days of medicines in the go-bag</li>
          <li>Fill water containers</li>
        </ul>
      </article>
    </section>
  )
}

export default StormCard
