import { useState } from 'react'
import { Icon } from '../shell/Icon'
import { FAIL_TEXT } from './actions'
import { joinNames, shortMed, type NextItem } from './nextPick'
import { markDue, markTaken } from './useDueMeds'

export const MEDS_HREF = '#health/meds' // lane M2's medicines screen; until it lands the Health tab opens

/** Today's one "Next up" card: the dose due within 3 hours or missed in the last 2 (mine or someone I care for), else the plan, else a nearby storm.
 *  Today does not render it for a calm pick (it gives the space to the weather card). A panel under it counts medicines waiting for "Still taking it?". */
export default function NextUp({ item, review, notify }: { item: NextItem; review: number; notify: (msg: string) => void }) {
  const [busy, setBusy] = useState(false)
  const [picking, setPicking] = useState(false) // 2+ medicines due together: Taken asks which ones
  const [off, setOff] = useState<string[]>([]) // unticked keys; everything starts ticked
  const w = item.who
  const many = (w?.slots.length ?? 0) > 1

  const act = async (skip: boolean) => {
    if (!w || busy) return
    if (!skip && many && !picking) { setOff([]); return setPicking(true) }
    setBusy(true)
    const keep = w.slots.filter((x) => !off.includes(x.key))
    const ok = !skip && many ? (keep.length > 0 && (await markTaken(w.personId, keep.map((x) => x.key))) === keep.length) : await markDue(w, skip)
    setBusy(false)
    const what = joinNames([...new Set((skip || !many ? w.slots : keep).map((x) => shortMed(x.name)))])
    if (ok) setPicking(false)
    notify(ok ? (skip ? `Skipped ${what}` : `Marked ${what} taken`) : FAIL_TEXT.failed)
  }

  return (
    <section aria-labelledby="t-next">
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
                <span>{shortMed(x.name)}{x.dose ? ` ${x.dose}` : ''}</span>
              </label>
            ))}
          </fieldset>
        )}
        {w && (
          <div className="td-act">
            <button type="button" className="td-pill light td-taken" disabled={busy || (picking && off.length >= w.slots.length)} onClick={() => void act(false)}><Icon name="check" size={20} stroke={2.4} />{picking ? 'Mark these taken' : 'Taken'}</button>
            {w.slots.every((x) => x.medicationId) && <button type="button" className="td-skip" disabled={busy} onClick={() => void act(true)}>Skip</button>}
          </div>
        )}
        {item.href && <div className="td-act"><a className="td-pill light" href={item.href}>{item.linkLabel}</a></div>}
      </article>
      {review > 0 && <MedsCheck review={review} />}
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
