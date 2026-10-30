import { useState } from 'react'
import AlertBand from './AlertBand'
import { loadFamily } from '../auth/family'
import { usePlace } from '../location/useLocation'
import { alertRef } from '../location/place'
import { ALERTS_KEY, type Alert } from '../safety/alerts'
import { useKv } from '../safety/store'
import { weatherWarning } from '../weather/warning'
import Call911 from '../sos/Call911'
import { normalizeContacts, validPhone } from '../sos/contacts'
import SosHold from '../sos/SosHold'
import SosScreen from '../sos/SosScreen'
import { FAIL_TEXT, FEELINGS, feelingToast, logFeeling, moodLine, useHasWriterCarer, type Feeling } from './actions'
import { Icon } from '../shell/Icon'
import BpCheck from '../health/bpcheck/BpCheck'
import { useActingCan, useActingPersonId } from '../viewas/viewAs' // S16-L1: acting person + View only (C-9)
import { weatherAction, zoneAlert } from './heroCards'
import { joinNames, pickNext } from './nextPick'
import { markDue, useDueMeds } from './useDueMeds'
import { useStorm } from './useStorm'
import { useSosActive } from '../family/sosActive'
import { useWeather } from './weather'
import WeatherCard from './WeatherCard'
import { JackArt } from '../look'
import { IncomingSos } from '../family/IncomingSos'

/** S16-L1 (C-5): L6 adds a trailing `personId` to logFeeling; the L0 signature lacks it until that merges, so call through this type (same one-liner as QuickLog). */
const withPerson = <A extends unknown[], R>(f: (...a: A) => R) => f as unknown as (...a: [...A, string?]) => R

/** Night for Jack's sleepy sticker: 9 PM to before 5 AM, phone time. */
export const isNight = (d: Date) => d.getHours() >= 21 || d.getHours() < 5

const NONE: Alert[] = []
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
  const alerts = useKv<Alert[]>(ALERTS_KEY, NONE)
  const [busy, setBusy] = useState(false)
  const [sos, setSos] = useState(false)
  const [view, setView] = useState<'home' | 'mood' | 'taken'>('home')
  const [doneNames, setDoneNames] = useState('')
  const [err, setErr] = useState('')
  const [bp, setBp] = useState(false)
  const self = useActingPersonId() // the viewed person while an admin is acting, else me
  const can = useActingCan()
  const lockLog = !!can && !can.log
  const lockMood = !!can && !can.mood
  const writer = useHasWriterCarer(self)
  const item = pickNext({ due, plan: null, storm }, tick)
  const w = item.who
  const calm = item.kind === 'calm'
  // The sleepy Jack only when nothing needs action: no dose or storm card, no warning band, no weather warning. It is then the screen's one Jack (the weather card drops its own).
  const sosLive = useSosActive()
  const sleepy = isNight(tick) && calm && !sosLive && !zoneAlert(alerts, place ? alertRef(place) : null) && !(place && weatherWarning(alerts, place.weather))
  const taken = async () => {
    if (!w || busy || lockLog) return
    setBusy(true)
    const ok = await markDue(w)
    setBusy(false)
    if (!ok) return notify(FAIL_TEXT.failed)
    setDoneNames(joinNames([...new Set(w.slots.map((s) => s.name))]))
    setView('taken')
  }
  const face = async (f: Feeling) => {
    if (busy || lockMood) return
    setBusy(true)
    const r = await withPerson(logFeeling)(f, self ?? undefined)
    setBusy(false)
    if (r === 'told' || r === 'nobody' || r === 'untold' || r === 'refused') { setErr(''); setView('home'); notify(feelingToast(r)) } else setErr(FAIL_TEXT[r])
  }
  if (sos) return <SosScreen onClose={() => setSos(false)} /> // the same hold-to-send flow as the Safety tab
  if (view === 'mood') {
    return (
      <div className="td-simple">
        <h2 className="td-simple-h">How are you?</h2>
        {FEELINGS.map(([f, label]) => <button key={f} type="button" className={`td-face big ${FACE_CLASS[f]}`} disabled={busy} onClick={() => void face(f)}>{label}</button>)}
        {err && <p className="td-err" role="alert">{err}</p>}
        <p className="td-sub td-simple-sub">{moodLine(writer)}</p>
        <button type="button" className="td-exit bottom" onClick={() => { setErr(''); setView('home') }}>Not now</button>
      </div>
    )
  }
  if (view === 'taken') {
    return (
      <div className="td-simple">
        <JackArt name="well-done" size={96} decorative />
        <h2 className="td-simple-h">Well done</h2>
        <p className="td-simple-p">{doneNames ? `${doneNames} marked as taken.` : 'Marked as taken.'}</p>
        <p className="td-sub td-simple-sub">Your family will see it in Bantay.</p>
        <button type="button" className="td-bigbtn ok" onClick={() => setView('home')}>Done</button>
      </div>
    )
  }
  return (
    <div className="td-simple">
      <button type="button" className="td-exit" onClick={onExit}><Icon name="close" size={20} />Exit</button>
      <IncomingSos placement="today" />
      <AlertBand />
      {sleepy && <p className="td-simple-night"><JackArt name="sleepy" size={56} decorative />No medicine due right now. Good night.</p>}
      {calm ? <WeatherCard expanded review={review} noJack={sleepy || sosLive} /> : (
        <>
          <article className={`td-slide ${item.kind}${item.late ? ' late' : ''}`} aria-label={item.title}>
            <div className="td-k">{item.kicker}</div>
            <h2>{item.title}</h2>
            <p>{item.body}</p>
            {item.note && <p className="td-note">{item.note}</p>}
            {item.href && <div className="td-act"><a className="td-pill light" href={item.href}>{item.linkLabel}</a></div>}
            {w && <div className="td-act"><button type="button" className="td-pill light td-taken td-taken-big" disabled={busy || lockLog} onClick={() => void taken()}><Icon name={lockLog ? 'lock' : 'check'} size={32} />{lockLog ? 'View only' : 'I took it'}</button></div>}
          </article>
          {action && <p className="td-wxline td-wxline-big">{action}</p>}
        </>
      )}
      <SosHold onSend={() => setSos(true)} />
      <Call911 />
      <div className="td-big-btns">
        <button type="button" className="td-bigbtn ok" disabled={lockMood} onClick={() => setView('mood')}>{lockMood ? 'View only' : 'How are you?'}</button>
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
