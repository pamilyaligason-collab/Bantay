import { useEffect, useMemo, useState } from 'react'
import { ALL_IDS } from '../gobag/items'
import { EMPTY as BAG_EMPTY, KEY as BAG_KEY, readState } from '../gobag/state'
import { FAIL_TEXT, feelingToast, type Feeling, logFeeling } from '../today/actions'
import { useActingCan, useActingPersonId } from '../viewas/viewAs' // S16-L1
import { useFamilyPeople } from '../family/roster'
import { givenName } from '../health/medName'
import { Icon } from '../shell/Icon'
import { ALERTS_KEY, type Alert } from './alerts'
import { ensureStormTasks, fetchRollcall, sendRollcall, STORM_TASKS, tally, type RollStatus } from './rollcall'
import { liveSignals, PAGASA_CREDIT, signalOf, stormKey, stormRef, stormTitle } from './stormMode'
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
  const [safeSaid, setSafeSaid] = useState<string | null>(null)
  const selfId = useActingPersonId() // S16-L1: acts as the viewed person while an admin is acting
  const top = liveSignals(alerts, now)[0]
  const ref = top ? stormRef(top) : null
  useEffect(() => { if (ref) void ensureStormTasks(ref) }, [ref]) // the shared Do now list: the server makes the 4 family tasks once per storm
  if (!top || !ref) return null
  const n = signalOf(top)!
  const answer = async (f: (typeof FACES)[number]) => {
    const r = await logFeeling(f.feeling)
    if (r === 'untold' || r === 'refused' || r === 'nobody') return setSaved(feelingToast(r) + (f.feeling === 'unwell' ? ' If you need help now, hold SOS or call 911.' : ''))
    if (r !== 'told') return setSaved(FAIL_TEXT[r])
    setSaved(f.feeling === 'unwell' ? 'Saved. Your family can see it in Bantay. If you need help now, hold SOS or call 911.' : 'Saved. Your family can see it in Bantay.')
  }
  const roll = async (status: RollStatus) => {
    if (!selfId) return setSafeSaid('Sign in first, then try again.')
    const r = await sendRollcall(selfId, ref, status)
    if (r === 'offline') return setSafeSaid('No signal. Your family has not seen this. Try again, or call them.')
    if (r === 'refused') return setSafeSaid('Could not save. Call your family.')
    setSafeSaid(status === 'ok' ? 'Saved. Your family can see you are safe.' : 'Saved. Your family can see you need help. If it is an emergency, hold SOS or call 911.')
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
        <h2 className="sf-h2">Is everyone safe?</h2>
        <div className="sf-faces" role="group" aria-label="Is everyone safe?">
          <button type="button" className="sf-face" onClick={() => void roll('ok')}>I'm safe</button>
          <button type="button" className="sf-face" onClick={() => void roll('need_help')}>I need help</button>
        </div>
        {safeSaid && <p className="sub" role="status" style={{ margin: 0 }}>{safeSaid}</p>}
      </article>
      <article className="sf-checkin">
        <h2 className="sf-h2">Do now</h2>
        <ul className="sf-do">
          {STORM_TASKS.map((t) => <li key={t}>{t}</li>)}
          <li><a href="#gobag">Go-bag: {bag.done.length} of {ALL_IDS.length} packed</a></li>
        </ul>
      </article>
    </section>
  )
}

export default StormCard

const POLL_MS = 30_000
const clock12 = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila' }) }

/** The storm part of the Today WarningCard (S16 L1, W-10..W-12, R11): the roll-call pair "I'm OK" / "I need help", who has answered, four one-line Do now rows, and the links
 *  live has (source, All warnings, the Go-bag, Track the storm). The roll call goes through `rollcall_set` as the acting person; it needs no push (A-10). Closing the card never removes this block (WarningCard keeps it while a signal is live). */
export function StormBlock({ now, compact = false }: { now?: number; compact?: boolean }) {
  const alerts = useKv<Alert[]>(ALERTS_KEY, NONE)
  const bag = readState(useKv<unknown>(BAG_KEY, BAG_EMPTY))
  const selfId = useActingPersonId()
  const can = useActingCan() // null when not acting; while acting, the roll call needs the rollcall right (C-9)
  const locked = !!can && !can.rollcall
  const { people } = useFamilyPeople()
  const [said, setSaid] = useState<string | null>(null)
  const [rows, setRows] = useState<Awaited<ReturnType<typeof fetchRollcall>>>(null)
  const signals = liveSignals(alerts, now)
  const top = signals[0]
  const ref = top ? stormRef(top) : null
  const refsKey = top ? signals.filter((a) => stormKey(a) === stormKey(top)).map(stormRef).join('|') : ''
  useEffect(() => { if (ref) void ensureStormTasks(ref) }, [ref])
  useEffect(() => {
    if (!ref) return
    let live = true
    const load = () => void fetchRollcall(refsKey.split('|')).then((r) => { if (live && r) setRows(r) })
    load()
    const t = setInterval(load, POLL_MS)
    window.addEventListener('online', load)
    return () => { live = false; clearInterval(t); window.removeEventListener('online', load) }
  }, [ref, refsKey])
  const t = useMemo(() => tally(people.map((p) => p.id), rows ?? []), [people, rows])
  if (!top || !ref) return null
  const name = (id: string) => givenName(people.find((p) => p.id === id)?.name ?? '')
  const roll = async (status: RollStatus) => {
    if (locked) return
    if (!selfId) return setSaid('Sign in first, then try again.')
    const r = await sendRollcall(selfId, ref, status)
    if (r === 'offline') return setSaid('No signal. Your family has not seen this. Try again, or call them.')
    if (r === 'refused') return setSaid('Could not save. Call your family.')
    setSaid(status === 'ok' ? 'Saved. Your family can see you are safe.' : 'Saved. Your family can see you need help. If it is an emergency, hold SOS or call 911.')
    void fetchRollcall(refsKey.split('|')).then((x) => { if (x) setRows(x) })
  }
  // Closed card: the row stays only while my answer is missing (PLAN 1.1: "while a signal is live and unanswered"). Answered = no card at all, not an empty heading.
  if (compact && selfId && rows?.some((r) => r.personId === selfId)) return null
  const pair = (
    <>
      <div className="sf-pair">
        <button type="button" className="btn sf-roll" disabled={locked} onClick={() => void roll('ok')}>{locked ? <Icon name="lock" size={20} /> : <Icon name="check" size={20} />}{locked ? 'View only' : "I'm OK"}</button>
        <button type="button" className="btn sf-roll sf-roll-help" aria-label={locked ? 'Need help, view only' : 'I need help'} disabled={locked} onClick={() => void roll('need_help')}>{locked ? <Icon name="lock" size={20} /> : null}{locked ? 'View only' : 'Need help'}</button>
      </div>
      {locked && can?.reason && <p className="sub sf-said">{can.reason}</p>}
      {said && <p className="sub sf-said" role="status">{said}</p>}
      {rows !== null && people.length > 0 && (
        <p className="sub sf-tally">
          {[
            t.safe.length > 0 && <span key="ok">OK: {t.safe.map(name).join(', ')}</span>,
            t.help.length > 0 && <span key="help" className="sf-warn">Needs help: {t.help.map(name).join(', ')}</span>, // a call for help is never shown as a non-answer
            t.none.length > 0 && <span key="wait">Waiting: {t.none.map(name).join(', ')}</span>
          ].filter(Boolean).flatMap((x, i) => (i ? [' · ', x] : [x]))}
        </p>
      )}
    </>
  )
  if (compact) {
    return (
      <section className="card td-rc" aria-label="Storm check-in" data-testid="storm-rollcall">
        <h2 className="td-rc-h">Is everyone safe?</h2>
        <div className="sf-block" data-testid="storm-block">{pair}</div>
      </section>
    )
  }
  return (
    <div className="sf-block" data-testid="storm-block">
      <h3 className="sf-h2 sf-block-h">Is everyone safe?</h3>
      <ul className="sf-do sf-do-rows" aria-label="Do now">
        {STORM_TASKS.map((x) => <li key={x}><Icon name="check" size={16} />{x}</li>)}
      </ul>
      {pair}
      <p className="sf-src-line"><span>{top.source} · {clock12(top.issuedAt) || top.when.replace(' PH time', '')}</span>{top.sourceUrl && <> · <a href={top.sourceUrl} target="_blank" rel="noopener noreferrer">Source</a></>}</p>
      <div className="sf-links">
        <a className="sf-link-row" href="#safety/warnings">All warnings<Icon name="chev" size={20} /></a>
        <a className="sf-link-row" href="#gobag">Go-bag: {bag.done.length} of {ALL_IDS.length} packed<Icon name="chev" size={20} /></a>
        <a className="sf-link-row" href="#safety/storms">Track the storm<Icon name="chev" size={20} /></a>
      </div>
    </div>
  )
}
