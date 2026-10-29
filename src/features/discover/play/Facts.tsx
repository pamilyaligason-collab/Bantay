import { useEffect, useMemo, useState } from 'react'
import { Icon } from '../../shell/Icon'
import { loadOnThisDay, phFactOf, WIKI_CREDIT, WIKI_LICENCE_URL, type OtdEvent } from '../facts/onThisDay'
import { dayKey } from './score'
import './play.css'

/** Fun facts today: three "On this day" cards (Wikipedia, credit and link on every card) and one Philippine fact from the bundled list, which works offline. */
export default function Facts({ onBack, now }: { onBack: () => void; now?: Date }) {
  const today = useMemo(() => now ?? new Date(), [now])
  const [otd, setOtd] = useState<{ items: OtdEvent[]; stale: boolean } | null | undefined>(undefined)
  const [i, setI] = useState(0)
  useEffect(() => { let live = true; void loadOnThisDay(today).then((r) => { if (live) setOtd(r) }); return () => { live = false } }, [today])
  const e = otd?.items[i]
  return (
    <div className="fp" data-testid="facts">
      <div className="fp-head">
        <button type="button" className="sh-iconbtn" aria-label="Back to Play" onClick={onBack}><Icon name="back" /></button>
        <div><h2>Fun facts</h2><span className="fp-note">Discover, Play</span></div>
      </div>
      <section className="sh-card fp-fact" aria-label="On this day">
        <span className="sh-sub">On this day · {today.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}</span>
        {otd === undefined ? <span className="fp-note" role="status">Loading</span>
          : !e ? <span className="fp-note" role="status">No signal yet. Today's events will show up when you are online.</span>
          : (
            <>
              <b>{e.year}: {e.text}</b>
              <span className="fp-note">{i + 1} of {otd.items.length} events.{otd.stale ? ' Saved from an earlier day.' : ''}</span>
              <span className="fp-note">{WIKI_CREDIT} <a href={WIKI_LICENCE_URL} target="_blank" rel="noopener noreferrer">Licence</a>{e.url && <> <a href={e.url} target="_blank" rel="noopener noreferrer">Open on Wikipedia</a></>}</span>
              <div className="fp-row">
                <button type="button" className="sh-pill sh-ghost sh-small" disabled={i === 0} onClick={() => setI(i - 1)}>Earlier</button>
                <button type="button" className="sh-pill sh-ghost sh-small" disabled={i >= otd.items.length - 1} onClick={() => setI(i + 1)}>Later</button>
              </div>
            </>
          )}
      </section>
      <section className="sh-card fp-fact is-soft" aria-label="Did you know? Philippines">
        <span className="sh-sub">Did you know? Philippines</span>
        <b>{phFactOf(dayKey(today))}</b>
      </section>
      <div className="fp-src"><Icon name="info" size={18} /><span>On this day facts are from Wikipedia (CC BY-SA). The Philippine fact is ours and works offline.</span></div>
    </div>
  )
}
