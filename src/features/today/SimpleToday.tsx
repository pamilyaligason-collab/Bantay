import { useState } from 'react'
import AlertBand from './AlertBand'
import { loadFamily } from '../auth/family'
import { usePlace } from '../location/useLocation'
import { useKv } from '../safety/store'
import Call911 from '../sos/Call911'
import { normalizeContacts, validPhone } from '../sos/contacts'
import SosHold from '../sos/SosHold'
import SosScreen from '../sos/SosScreen'
import { FAIL_TEXT, FEELINGS, feelingToast, logFeeling, type Feeling } from './actions'
import { Icon } from '../shell/Icon'
import BpCheck from '../health/bpcheck/BpCheck'
import { useSelfPersonId } from '../setup/useProfile'
import { weatherAction } from './heroCards'
import { joinNames, pickNext } from './nextPick'
import { markDue, useDueMeds } from './useDueMeds'
import { useStorm } from './useStorm'
import { useWeather } from './weather'
import WeatherCard from './WeatherCard'

const FACE_CLASS: Record<Feeling, string> = { great: 'good', ok: 'good', notgreat: 'mid', unwell: 'bad' }

/** Simple mode (Me switch `mode.simple`): the next dose with a big I took it button, then Hold for help (3 seconds) and Call 911, How are you? and Call <family contact>, plus the weather action line when one applies.
 *  Three screens: the home above, simple-mood (four big faces, Not now) and simple-taken (Well done). The home may scroll; Call <family> can sit below the fold on 390x844.
 *  Call family rings the first SOS contact; with none saved it opens Safety to add one.
 *  With nothing next the card gives way to the expanded weather card (as on the full page). Exit simple mode sits at the top and the bottom. */
export default function SimpleToday({ onExit, notify }: { onExit: () => void; notify: (msg: string) => void }) {
  const raw = useKv<unknown>('sos.contacts', [])
  const contact = normalizeContacts(raw, loadFamily()).find((c) => validPhone(c.phone))
  const phone = contact?.phone.replace(/[^\d+]/g, '')
  const { due, review, tick } = useDueMeds()
  const storm = useStorm()
  const place = usePlace()
  const action = weatherAction(useWeather(place?.weather ?? null))
  const [busy, setBusy] = useState(false)
  const [sos, setSos] = useState(false)
  const [view, setView] = useState<'home' | 'mood' | 'taken'>('home')
  const [doneNames, setDoneNames] = useState('')
  const [err, setErr] = useState('')
  const [bp, setBp] = useState(false)
  const self = useSelfPersonId()
  const item = pickNext({ due, plan: null, storm }, tick)
  const w = item.who
  const calm = item.kind === 'calm'
  const taken = async () => {
    if (!w || busy) return
    setBusy(true)
    const ok = await markDue(w)
    setBusy(false)
    if (!ok) return notify(FAIL_TEXT.failed)
    setDoneNames(joinNames([...new Set(w.slots.map((s) => s.name))]))
    setView('taken')
  }
  const face = async (f: Feeling) => {
    if (busy) return
    setBusy(true)
    const r = await logFeeling(f)
    setBusy(false)
    if (r === 'told' || r === 'untold') { setErr(''); setView('home'); notify(feelingToast(r)) } else setErr(FAIL_TEXT[r])
  }
  if (sos) return <SosScreen onClose={() => setSos(false)} /> // the same hold-to-send flow as the Safety tab
  if (view === 'mood') {
    return (
      <div className="td-simple">
        <h2 className="td-simple-h">How are you?</h2>
        {FEELINGS.map(([f, label]) => <button key={f} type="button" className={`td-face big ${FACE_CLASS[f]}`} disabled={busy} onClick={() => void face(f)}>{label}</button>)}
        {err && <p className="td-err" role="alert">{err}</p>}
        <p className="td-sub td-simple-sub">Your family will see it in Bantay.</p>
        <button type="button" className="td-exit bottom" onClick={() => { setErr(''); setView('home') }}>Not now</button>
      </div>
    )
  }
  if (view === 'taken') {
    return (
      <div className="td-simple">
        <h2 className="td-simple-h">Well done</h2>
        <p className="td-simple-p">{doneNames ? `${doneNames} marked as taken.` : 'Marked as taken.'}</p>
        <p className="td-sub td-simple-sub">Your family will see it in Bantay.</p>
        <button type="button" className="td-bigbtn ok" onClick={() => setView('home')}>Done</button>
      </div>
    )
  }
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
            {w && <div className="td-act"><button type="button" className="td-pill light td-taken td-taken-big" disabled={busy} onClick={() => void taken()}><Icon name="check" size={28} stroke={2.4} />I took it</button></div>}
          </article>
          {action && <p className="td-wxline td-wxline-big">{action}</p>}
        </>
      )}
      <SosHold onSend={() => setSos(true)} />
      <Call911 />
      <div className="td-big-btns">
        <button type="button" className="td-bigbtn ok" onClick={() => setView('mood')}>How are you?</button>
        <a className="td-bigbtn call" href={phone ? `tel:${phone}` : '#safety'}>{contact && phone ? `Call ${contact.name}` : 'Add a family number'}</a>
      </div>
      <div className="td-big-btns">
        <button type="button" className="td-bigbtn" onClick={() => setBp(true)} disabled={!self}>Check my blood pressure</button>
        {calm && <a className="td-bigbtn" href="#health/meds">Medicines</a>}
      </div>
      <button type="button" className="td-exit bottom" onClick={onExit}>Exit simple mode</button>
      {bp && self && <BpCheck personId={self} forName="You" onClose={() => setBp(false)} onSaved={(m) => { setBp(false); notify(m) }} />}
    </div>
  )
}
