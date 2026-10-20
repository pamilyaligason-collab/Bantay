import { useState } from 'react'
import { loadFamily } from '../auth/family'
import { usePlace } from '../location/useLocation'
import { useKv } from '../safety/store'
import { normalizeContacts, validPhone } from '../sos/contacts'
import { FAIL_TEXT } from './actions'
import { weatherAction } from './heroCards'
import { joinNames, pickNext } from './nextPick'
import { markDue, useDueMeds } from './useDueMeds'
import { useWeather } from './weather'

/** Simple mode (Me switch `mode.simple`): the next dose with a big Taken button, then I'm OK, Call family and SOS, plus the weather action line when one applies.
 *  Call family rings the first SOS contact; with none saved it opens Safety to add one. */
export default function SimpleToday({ onOk, notify }: { onOk: () => void; notify: (msg: string) => void }) {
  const raw = useKv<unknown>('sos.contacts', [])
  const phone = normalizeContacts(raw, loadFamily()).find((c) => validPhone(c.phone))?.phone.replace(/[^\d+]/g, '')
  const { due } = useDueMeds()
  const place = usePlace()
  const action = weatherAction(useWeather(place?.weather ?? null))
  const [busy, setBusy] = useState(false)
  const item = pickNext({ due, plan: null, storm: null })
  const w = item.who
  const taken = async () => {
    if (!w || busy) return
    setBusy(true)
    const ok = await markDue(w)
    setBusy(false)
    notify(ok ? `Marked ${joinNames([...new Set(w.slots.map((s) => s.name))])} taken` : FAIL_TEXT.failed)
  }
  return (
    <div className="td-simple">
      <article className={`td-slide ${item.kind}`} aria-label={item.title}>
        <div className="td-k">{item.kicker}</div>
        <h2>{item.title}</h2>
        <p>{item.body}</p>
        {w && <div className="td-act"><button type="button" className="td-pill light td-taken td-taken-big" disabled={busy} onClick={() => void taken()}>Taken</button></div>}
      </article>
      {action && <p className="td-wxline td-wxline-big">{action}</p>}
      <div className="td-big-btns">
        <button type="button" className="td-bigbtn ok" onClick={onOk}>I&apos;m OK</button>
        <a className="td-bigbtn call" href={phone ? `tel:${phone}` : '#safety'}>{phone ? 'Call family' : 'Add a family number'}</a>
        <a className="td-bigbtn sos" href="#safety">SOS</a>
      </div>
    </div>
  )
}
