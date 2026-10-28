import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { Icon } from '../shell/Icon'
import { FAIL_TEXT } from './actions'
import { shortMedName } from '../health/medName'
import { doseDay, joinNames, type NextItem } from './nextPick'
import { markDue, markTaken } from './useDueMeds'
import { COLLAPSE_MS, leaveMs, MORPH_MS, takenLabel } from './doneMorph'
import { prefersReducedMotion } from '../look/useReducedMotion'
import { JackArt } from '../look'
import { loadLang } from '../../lib/i18n'
import { snoozeCard } from './snoozeCard'
import { Capacitor } from '@capacitor/core'
import { useSosActive } from '../family/sosActive'

export const SNOOZE_MIN = 10 // the same minutes as reminderActions.SNOOZE_MIN (a test holds them equal); that module is loaded on tap, not here, so WeatherStrip's import chain stays light
export const MEDS_HREF = '#health/meds' // lane M2's medicines screen; until it lands the Health tab opens

/** Today's one "Next up" card: the dose due within 3 hours or missed in the last 2 (mine or someone I care for), else the plan, else a nearby storm.
 *  Today does not render it for a calm pick (it gives the space to the weather card). A panel under it counts medicines waiting for "Still taking it?". */
export default function NextUp({ item, review, notify, hold }: { item: NextItem; review: number; notify: (msg: string) => void; hold?: (it: NextItem | null) => void }) {
  const [busy, setBusy] = useState(false)
  const sos = useSosActive() // no Jack beside a live SOS banner (D-91)
  const [phase, setPhase] = useState<'idle' | 'done' | 'leave'>('idle') // done: the button reads "Taken h:mm"; leave: the card collapses
  const [label, setLabel] = useState('')
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  const holdRef = useRef(hold)
  holdRef.current = hold
  useEffect(() => () => { timers.current.forEach(clearTimeout); holdRef.current?.(null) }, []) // leaving early (SOS, Simple mode, Today closing) must free the held card
  const [picking, setPicking] = useState(false) // 2+ medicines due together: Taken asks which ones
  const [off, setOff] = useState<string[]>([]) // unticked keys; everything starts ticked
  const w = item.who
  const many = (w?.slots.length ?? 0) > 1

  const act = async (skip: boolean) => {
    if (!w || busy) return
    if (!skip && many && !picking) { setOff([]); return setPicking(true) }
    setBusy(true)
    hold?.(item) // keep this card up while the write runs: the live data flips to the next pick the moment the take is saved
    const keep = w.slots.filter((x) => !off.includes(x.key))
    const ok = !skip && many ? (keep.length > 0 && (await markTaken(w.personId, keep.map((x) => x.key))) > 0) : await markDue(w, skip)
    setBusy(false)
    const what = joinNames([...new Set((skip || !many ? w.slots : keep).map((x) => shortMedName(x.name)))])
    if (ok) setPicking(false)
    if (ok && !skip) { // only after the write succeeded: morph the button in place, then collapse the card
      const reduced = prefersReducedMotion()
      setLabel(takenLabel(new Date()))
      setPhase('done')
      timers.current.push(setTimeout(() => setPhase('leave'), MORPH_MS), setTimeout(() => hold?.(null), MORPH_MS + leaveMs(reduced)))
    } else hold?.(null)
    notify(ok ? (skip ? `Skipped ${what}` : `Marked ${what} taken`) : FAIL_TEXT.failed)
  }

  /** In 10 min: the card hides until then (snoozeCard), and the phone rings once more in 10 minutes (the lock-screen button's snooze, reused). Never throws. */
  const later = async () => {
    if (!w) return
    snoozeCard(item.key, SNOOZE_MIN)
    notify(Capacitor.isNativePlatform() ? `Okay. I will remind you in ${SNOOZE_MIN} minutes` : `Okay. This card comes back in ${SNOOZE_MIN} minutes`) // the web build rings nothing
    try {
      const [{ handleReminderAction }, { alarmText }] = await Promise.all([import('../health/reminderActions'), import('../health/reminders')])
      const text = alarmText(w.at, 1, await loadLang()) // no rep: reminderActions rings once more, in 10 minutes
      await handleReminderAction({ actionId: 'snooze', notification: { ...text, extra: { kind: 'dose', at: w.at, day: doseDay(w, new Date()), people: [w.personId] } } })
    } catch { /* the web has no alarm; the card still comes back */ }
  }

  return (
    <section aria-labelledby="t-next" className={`td-next${phase === 'leave' ? ' leaving' : ''}`} style={{ '--collapse-ms': `${COLLAPSE_MS}ms` } as CSSProperties}>
      <div className="td-next-in">
      <h2 id="t-next" className="td-vh">Next up</h2>
      <article className={`td-slide ${item.kind}${item.late ? ' late' : ''}`} aria-label={item.title}>
        <div className="td-k">{item.kicker}</div>
        <h3>{item.title}</h3>
        <p>{item.body}</p>
        {item.note && <p className="td-note">{item.note}</p>}
        {w && picking && (
          <fieldset className="td-checks">
            <legend>Which did you take?</legend>
            {w.slots.map((x) => (
              <label key={x.key} className="td-check">
                <input type="checkbox" checked={!off.includes(x.key)} onChange={(e) => setOff(e.target.checked ? off.filter((k) => k !== x.key) : [...off, x.key])} />
                <span>{shortMedName(x.name)}{x.dose ? ` ${x.dose}` : ''}</span>
              </label>
            ))}
          </fieldset>
        )}
        {w && (
          <div className="td-act">
            <button type="button" className={`td-pill light td-taken${phase !== 'idle' ? ' done' : ''}`} disabled={busy || phase !== 'idle' || (picking && off.length >= w.slots.length)} onClick={() => void act(false)}><Icon name="check" size={20} stroke={2.4} />{phase !== 'idle' ? <span className="td-morph">{label}</span> : picking ? 'Mark these taken' : 'Taken'}</button>
            {phase === 'idle' && w.slots.every((x) => x.medicationId) && <button type="button" className="td-skip" disabled={busy} onClick={() => void act(true)}>Skip</button>}
            {phase === 'idle' && item.late && <button type="button" className="td-skip" disabled={busy} onClick={() => void later()}>In {SNOOZE_MIN} min</button>}
          </div>
        )}
        {w && phase !== 'idle' && <p className="td-saved">{!sos && <JackArt name="well-done" size={48} decorative />}Saved. This card folds away in a moment.</p>}
        {item.href && <div className="td-act"><a className="td-pill light" href={item.href}>{item.linkLabel}</a></div>}
      </article>
      {review > 0 && <MedsCheck review={review} />}
      </div>
    </section>
  )
}

/** The tinted "medicines to check" panel (Still taking it?), shared by the Next up card and the expanded weather card. */
export function MedsCheck({ review, quiet }: { review: number; quiet?: boolean }) {
  const n = `${review} ${review === 1 ? 'medicine' : 'medicines'}`
  return (
    <a className="td-mc" href={MEDS_HREF}>
      <Icon name="pill" size={22} />
      <span className="td-grow">
        {quiet ? <span>Nothing due right now · <b>{n} to check</b></span> : <><b>{n} to check</b><span className="td-sub">Still taking {review === 1 ? 'it' : 'them'}?</span></>}
      </span>
      <Icon name="chev" size={20} />
    </a>
  )
}
