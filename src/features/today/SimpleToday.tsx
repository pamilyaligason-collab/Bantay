import { useState } from 'react'
import AlertBand from './AlertBand'
import { loadFamily } from '../auth/family'
import { usePlace } from '../location/useLocation'
import { useKv } from '../safety/store'
import { normalizeContacts, validPhone } from '../sos/contacts'
import { FAIL_TEXT } from './actions'
import { Icon } from '../shell/Icon'
import SosButton from '../sos/SosButton'
import SosScreen from '../sos/SosScreen'
import { weatherAction } from './heroCards'
import { joinNames, pickNext } from './nextPick'
import { markDue, useDueMeds } from './useDueMeds'
import { useStorm } from './useStorm'
import { useWeather } from './weather'
import WeatherCard from './WeatherCard'

/** Simple mode (Me switch `mode.simple`): the next dose with a big Taken button, then I'm OK, Call family and the real SOS button (hold 3 seconds), plus the weather action line when one applies.
 *  Call family rings the first SOS contact; with none saved it opens Safety to add one.
 *  With nothing next the card gives way to the expanded weather card (as on the full page). Exit simple mode sits at the top and the bottom. */
export default function SimpleToday({ onOk, onExit, notify }: { onOk: () => void; onExit: () => void; notify: (msg: string) => void }) {
  const raw = useKv<unknown>('sos.contacts', [])
  const phone = normalizeContacts(raw, loadFamily()).find((c) => validPhone(c.phone))?.phone.replace(/[^\d+]/g, '')
  const { due, review, tick } = useDueMeds()
  const storm = useStorm()
  const place = usePlace()
  const action = weatherAction(useWeather(place?.weather ?? null))
  const [busy, setBusy] = useState(false)
  const [sos, setSos] = useState(false)
  const item = pickNext({ due, plan: null, storm }, tick)
  const w = item.who
  const calm = item.kind === 'calm'
  const taken = async () => {
    if (!w || busy) return
    setBusy(true)
    const ok = await markDue(w)
    setBusy(false)
    notify(ok ? `Marked ${joinNames([...new Set(w.slots.map((s) => s.name))])} taken` : FAIL_TEXT.failed)
  }
  if (sos) return <SosScreen onClose={() => setSos(false)} /> // the same hold-to-send flow as the Safety tab
  return (
    <div className="td-simple">
      <button type="button" className="td-exit" onClick={onExit}><Icon name="close" size={18} />Exit</button>
      <AlertBand />
      {calm ? <WeatherCard expanded review={review} /> : (
        <>
          <article className={`td-slide ${item.kind}${item.late ? ' late' : ''}`} aria-label={item.title}>
            <div className="td-k">{item.kicker}</div>
            <h2>{item.title}</h2>
            <p>{item.body}</p>
            {item.note && <p className="td-note">{item.note}</p>}
            {item.href && <div className="td-act"><a className="td-pill light" href={item.href}>{item.linkLabel}</a></div>}
            {w && <div className="td-act"><button type="button" className="td-pill light td-taken td-taken-big" disabled={busy} onClick={() => void taken()}><Icon name="check" size={28} stroke={2.4} />Taken</button></div>}
          </article>
          {action && <p className="td-wxline td-wxline-big">{action}</p>}
        </>
      )}
      <div className="td-big-btns">
        <button type="button" className="td-bigbtn ok" onClick={onOk}>I&apos;m OK</button>
        <a className="td-bigbtn call" href={phone ? `tel:${phone}` : '#safety'}>{phone ? 'Call family' : 'Add a family number'}</a>
      </div>
      <SosButton onSend={() => setSos(true)} />
      <button type="button" className="td-exit bottom" onClick={onExit}>Exit simple mode</button>
    </div>
  )
}
