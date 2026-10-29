import { App } from '@capacitor/app'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { db, enqueue } from '../../db'
import { track } from '../admin/events'
import { loadFamily } from '../auth/family'
import { useKv } from '../shell/useKv'
import { selfIdOrCached } from '../sync/profile'
import { autoTextAllowed, clearActive, loadActive, saveActive, SOS_CONTACTS_KEY, takeFresh, type SosActive } from './active'
import { callFirstContact } from './call'
import { normalizeContacts } from './contacts'
import { addHistory, HISTORY_KEY, type SosEvent } from './history'
import { sosPosition, type SosFix } from './locate'
import { mapLink, SAFE_BODY, smsUris, sosBody, usableNumber } from './sms'
import SosContactsPicker from './SosContactsPicker'
import { useAcks } from './useAcks'
import { useSelf } from './useSelf'
import './sos.css'

const NONE: unknown[] = []
const FIX_MS = 4000 // the call must not wait long for GPS; a slower phone falls back to the home zone
const clock = (at: number) => new Date(at).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })
type Phase = 'finding' | 'calling' | 'texting' | 'status'

/** The SOS page is a bare full screen (mockup safety-sos-sent has no tab bar): drawn in the body, above the shell. */
const Bare = ({ children }: { children: ReactNode }) => createPortal(<div className="sos-bare" role="dialog" aria-modal="true" aria-label="SOS">{children}</div>, document.body)

/** Resolves when the app comes back to the foreground after having gone away (the call app or the dial screen opened). Call it BEFORE dialling. */
function waitForeground(): { back: Promise<void>; stop: () => void } {
  let stop = () => undefined as void
  const back = new Promise<void>((res) => {
    let away = document.visibilityState === 'hidden'
    let off = false
    const finish = () => { stop(); res() }
    const onVis = () => { if (document.visibilityState === 'hidden') away = true; else if (away) finish() }
    document.addEventListener('visibilitychange', onVis)
    const sub = Promise.resolve(App.addListener('appStateChange', ({ isActive }) => { if (!isActive) away = true; else if (away) finish() })).catch(() => undefined)
    stop = () => { if (off) return; off = true; document.removeEventListener('visibilitychange', onVis); void sub.then((h) => h?.remove()) }
  })
  return { back, stop }
}

/** The SOS flow after the hold, in this order (all of it works with no data: the call and the text are the phone's own apps):
 *  1 record (outbox row, the family sees it in Bantay), 2 call the first contact (auto-dial where allowed, else the dial screen, 911 if nobody is set),
 *  3 open the text once the app is back in front (only while the SOS is under 10 minutes old and not cancelled), 4 status with acks and cancel.
 *  The SOS in progress lives in kv `sos.active`: a WebView killed during a long call resumes on the status screen instead of restarting the flow.
 *  The flow never asks for the call permission (setup and the Me row do). Bantay never sends the text: the person taps Send. */
export default function SosScreen({ onClose }: { onClose: () => void }) {
  const [raw, setRaw, loaded] = useKv<unknown[]>(SOS_CONTACTS_KEY, NONE)
  const contacts = normalizeContacts(raw, loadFamily()).filter((c) => usableNumber(c.phone))
  const { name, personId } = useSelf()
  const [phase, setPhase] = useState<Phase>('finding')
  const [active, setActive] = useState<{ id: string; at: string } | null>(null)
  const [fix, setFix] = useState<SosFix | null>(null)
  const [saved, setSaved] = useState<boolean | null>(null) // null = still saving
  const [via, setVia] = useState<'native' | 'tel' | 'none' | null>(null)
  const [texted, setTexted] = useState<boolean[]>([false, false])
  const [cancelled, setCancelled] = useState(false)
  const acks = useAcks(saved ? active?.id ?? null : null)
  const ran = useRef(false)
  const live = useRef(true)
  const stopWait = useRef<() => void>(() => undefined)
  const latest = useRef({ contacts, name, personId })
  latest.current = { contacts, name, personId }
  const cancelledRef = useRef(false)
  const finished = useRef(false) // cancelled or closed: the flow must not write sos.active again
  const place = useRef<SosFix | null>(null)
  const savedRef = useRef(false) // the row is in the outbox: only then can a later PATCH find it

  const say = <T,>(set: (v: T) => void, v: T) => { if (live.current) set(v) }
  const bodyFor = (at: string) => {
    const f = place.current
    return sosBody({ name: latest.current.name, lat: f?.lat ?? null, lon: f?.lon ?? null, time: clock(Date.parse(at)), gps: !!f?.gps })
  }
  const openText = (id: string, at: string, i: number) => {
    const u = smsUris(latest.current.contacts, bodyFor(at))[i]
    if (!u) return
    setTexted((t) => t.map((v, k) => (k === i ? true : v)))
    if (savedRef.current) void enqueue('sos_events_update', 'update', { id, smsOpened: true }).catch(() => undefined)
    window.location.href = u.uri
  }

  useEffect(() => {
    live.current = true
    return () => { live.current = false; stopWait.current() }
  }, [])

  useEffect(() => {
    if (!loaded || ran.current) return
    ran.current = true
    void (async () => {
      const f = takeFresh()
      if (!f) {
        const a = await loadActive()
        if (a) { // resume: the app was closed or killed mid-call; show the status, never restart the flow
          const h = ((await db.kv.get(HISTORY_KEY).catch(() => undefined))?.value as SosEvent[] | undefined)?.find((e) => Math.abs(e.at - Date.parse(a.at)) < 5000)
          place.current = h ? { lat: h.lat, lon: h.lon, gps: h.gps, at: h.at } : null
          say(setFix, place.current)
          say(setActive, { id: a.id, at: a.at })
          savedRef.current = true
          say(setSaved, true)
          say(setPhase, 'status')
          return
        }
      }
      const start = f ?? { id: crypto.randomUUID(), at: new Date().toISOString() }
      say(setActive, start)
      void track('action', 'sos_hold')

      // 1 record
      // the person id arrives a moment after the screen (cache or network): look it up while GPS runs, never waiting more than 3 s
      const pidP = Promise.race([selfIdOrCached().catch(() => null), new Promise<null>((r) => setTimeout(() => r(null), 3000))])
      let got: SosFix | null = null
      try { got = await sosPosition(FIX_MS) } catch { got = null }
      place.current = got
      say(setFix, got)
      const cs = latest.current.contacts
      const pid = latest.current.personId ?? await pidP
      let ok = false
      if (pid) {
        try {
          await enqueue('sos_events', 'insert', { id: start.id, personId: pid, at: start.at, lat: got?.lat ?? null, lon: got?.lon ?? null, gps: got ? got.gps : null, callTo: cs.length ? 'family' : '911', smsOpened: false })
          ok = true
          void import('../sync/sync').then((m) => m.syncNow(true)).catch(() => undefined) // a backoff must not hold the SOS row back
        } catch { ok = false }
      }
      savedRef.current = ok
      say(setSaved, ok)
      if (got) void addHistory({ at: Date.parse(start.at), lat: got.lat, lon: got.lon, gps: got.gps, texted: false })
      const step = (s: SosActive['step']) => ok && !finished.current ? saveActive({ id: start.id, step: s, at: start.at, contactIndex: 0 }) : Promise.resolve() // an unsaved SOS is not resumed
      await step('recorded')

      // 2 call
      say(setPhase, 'calling')
      await step('calling')
      const w = waitForeground()
      stopWait.current = w.stop
      const r = cs.length ? await callFirstContact(cs) : await callFirstContact([], { emergency: true })
      say(setVia, r.via)
      if (r.via !== 'none') await w.back
      else w.stop()

      // 3 text: only when someone has a number, and only by itself while the SOS is young and not cancelled
      if (cs.length && live.current) {
        say(setPhase, 'texting')
        await step('texting')
        if (autoTextAllowed(start.at, cancelledRef.current)) openText(start.id, start.at, 0)
      }
      say(setPhase, 'status')
      await step('status')
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once, when the contacts have been read
  }, [loaded])

  const cancel = async () => {
    if (!active) return
    cancelledRef.current = true
    finished.current = true
    setCancelled(true)
    if (saved) await enqueue('sos_events_update', 'update', { id: active.id, cancelledAt: new Date().toISOString() }).catch(() => undefined)
    await clearActive()
    void track('action', 'sos_cancel')
  }
  const close = () => { finished.current = true; void clearActive(); onClose() }

  if (cancelled) {
    const safe = smsUris(contacts, SAFE_BODY)
    return (
      <Bare><div className="sh sos-page">
        <div className="sos-banner sos-banner-ok"><h2>Glad you are safe</h2><p>{saved ? 'The SOS is marked as a false alarm in your family’s Bantay.' : 'SOS is off.'} If your text already went out, you can tell them.</p></div>
        {safe.map((u) => <a key={u.uri} href={u.uri} className="sos-text">Text {u.name}: I am safe</a>)}
        <button type="button" className="btn2" onClick={close}>Back to Safety</button>
      </div></Bare>
    )
  }

  const first = contacts[0]
  const second = contacts[1]
  const at = active?.at ?? new Date().toISOString()
  const finding = phase === 'finding'
  const callName = first ? first.name.trim() || first.phone : '911'
  const callState = phase === 'calling' && via == null ? 'wait' : via === 'none' ? 'idle' : 'ok'
  const texting = (i: number) => texted[i]
  return (
    <Bare><div className="sh sos-page">
      <div className="sos-banner" role="status">
        <div className="sos-eyebrow">{saved ? 'SOS saved' : 'SOS started'} · {clock(Date.parse(at))}</div>
        <h2>{finding ? 'Finding where you are' : saved ? 'Your family will see this in Bantay' : 'Call 911 if it is an emergency'}</h2>
        <p>{finding ? 'This takes a few seconds. You can call 911 right now.' : 'Stay where you are if you can. Your phone does the call and the text.'}</p>
      </div>
      <ul className="sos-steps" data-testid="sos-status">
        <li data-state={saved === null ? 'wait' : saved ? 'ok' : 'idle'}>
          <b>{saved === null ? 'Saving the SOS for your family' : saved ? 'SOS saved for the family' : 'Could not save for the family'}</b>
          <span className="sub">{saved ? (acks > 0 ? `${acks} ${acks === 1 ? 'person has' : 'people have'} opened it in Bantay` : 'They see it when they open Bantay') : saved === false ? 'The call and the text still work' : 'This works without internet'}</span>
        </li>
        <li data-state={finding ? 'wait' : callState}>
          <b>{finding || phase === 'calling' && via == null ? `Calling ${callName}...` : via === 'native' ? `Called ${callName}` : via === 'none' ? 'No one to call yet' : `Dial screen opened for ${callName}`}</b>
          <span className="sub">{first ? 'First on your family list. The phone app does the call' : 'Add a contact below. 911 is one tap away'}</span>
        </li>
        <li data-state={texting(0) ? 'ok' : first ? 'wait' : 'idle'}>
          <b>{!first ? 'No text yet' : texting(0) ? `Text to ${first.name.trim() || first.phone} is open: tap Send` : 'Text to family ready, tap Send'}</b>
          <span className="sub">{first ? 'Name, time and map link are already written. Bantay never sends it for you' : 'Nobody has a phone number yet'}</span>
        </li>
      </ul>
      <button type="button" className="sos-911 sos-911-btn" onClick={() => void callFirstContact([], { emergency: true })}><span>Call 911<small>Emergency hotline</small></span></button>
      {first && (
        <button type="button" className="sos-card-btn" onClick={() => void callFirstContact([second ?? first])}>
          <span>{second ? `Call ${second.name.trim() || second.phone}` : `Call ${callName} again`}<small>{second ? 'Your other contact' : 'Phone app'}</small></span>
        </button>
      )}
      {first && active && (
        <button type="button" className="sos-card-btn" onClick={() => openText(active.id, at, 0)}>
          <span>{texted[0] ? 'Open text again' : `Text ${first.name.trim() || first.phone}`}<small>If the text screen closed</small></span>
        </button>
      )}
      {second && active && (
        <button type="button" className="sos-card-btn" onClick={() => openText(active.id, at, 1)}>
          <span>Text {second.name.trim() || second.phone}<small>One text for each person</small></span>
        </button>
      )}
      {!contacts.length && !finding && (
        <div className="sos-need">
          <b>Who gets the call and the text</b>
          <p className="sub">Add up to 2 people. Next time you press SOS, Bantay calls the first one and opens a text to each with your place.</p>
          <SosContactsPicker onSaved={setRaw} />
        </div>
      )}
      {fix && (
        <div className="sos-where">
          <b>{fix.gps ? 'Your location' : 'Home area (no GPS found)'}</b>
          <a href={mapLink(fix.lat, fix.lon)} target="_blank" rel="noopener noreferrer">{fix.lat.toFixed(5)}, {fix.lon.toFixed(5)} · {clock(fix.at)}</a>
        </div>
      )}
      {!finding && !fix && <p className="sub sos-nowhere">Your phone could not find your location. The text says so.</p>}
      <button type="button" className="sos-safe" onClick={() => void cancel()} disabled={finding}>Cancel, I don&apos;t need help</button>
      <button type="button" className="sos-alt" onClick={close}>Close</button>
    </div></Bare>
  )
}
