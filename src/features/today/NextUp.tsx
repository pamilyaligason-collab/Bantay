import { useState } from 'react'
import { Icon } from '../shell/Icon'
import { FAIL_TEXT } from './actions'
import { joinNames, type NextItem } from './nextPick'
import { markDue } from './useDueMeds'

export const MEDS_HREF = '#health/meds' // lane M2's medicines screen; until it lands the Health tab opens

/** Today's one "Next up" card: the dose due within 3 hours or missed in the last 2 (mine or someone I care for), else the plan, else a nearby storm.
 *  Today does not render it for a calm pick (it gives the space to the weather card). A panel under it counts medicines waiting for "Still taking it?". */
export default function NextUp({ item, review, notify }: { item: NextItem; review: number; notify: (msg: string) => void }) {
  const [busy, setBusy] = useState(false)

  const act = async (skip: boolean) => {
    const w = item.who
    if (!w || busy) return
    setBusy(true)
    const ok = await markDue(w, skip)
    setBusy(false)
    const what = joinNames([...new Set(w.slots.map((x) => x.name))])
    notify(ok ? (skip ? `Skipped ${what}` : `Marked ${what} taken`) : FAIL_TEXT.failed)
  }

  return (
    <section aria-labelledby="t-next">
      <h2 id="t-next" className="td-vh">Next up</h2>
      <article className={`td-slide ${item.kind}`} aria-label={item.title}>
        <div className="td-k">{item.kicker}</div>
        <h3>{item.title}</h3>
        <p>{item.body}</p>
        {item.note && <p className="td-note">{item.note}</p>}
        {item.who && (
          <div className="td-act">
            <button type="button" className="td-pill light td-taken" disabled={busy} onClick={() => void act(false)}><Icon name="check" size={20} stroke={2.4} />Taken</button>
            {item.who.slots.every((x) => x.medicationId) && <button type="button" className="td-skip" disabled={busy} onClick={() => void act(true)}>Skip</button>}
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
        {quiet ? <span>All medicines done today · <b>{n} to check</b></span> : <><b>{n} to check</b><span className="td-sub">Still taking {review === 1 ? 'it' : 'them'}?</span></>}
      </span>
      <Icon name="chev" size={20} />
    </a>
  )
}
