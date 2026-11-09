import { useEffect } from 'react'
import hotlines from '../../data/safety/hotlines.json'
import { track } from '../admin/events'
import { crisisLines, telHref, type HotlineRow } from './crisis'
import './calm.css'

/** S26 (D-164): the Today hero card. Calm teal (never SOS red, never the 911 button style), the one --shadow-hero on the screen. "Talk" opens #calm, where the numbers are (CrisisCard below);
 *  911 stays first in the words. Tracks card_talk when shown and when Talk is tapped. */
export function TalkCard() {
  useEffect(() => { void track('action', 'card_talk') }, [])
  return (
    <section className="cm-talk" data-testid="today-talk" aria-labelledby="cm-talk-h">
      <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" /></svg>
      <div className="cm-talk-body">
        <h2 id="cm-talk-h" className="cm-talk-t">Need to talk to someone?</h2>
        <p className="cm-talk-s">Hotline numbers and calming tools. In danger now? Call 911.</p>
      </div>
      <a className="cm-talk-btn" href="#calm" aria-label="Talk to someone: open hotline numbers" onClick={() => void track('action', 'card_talk')}>Talk</a>
    </section>
  )
}

/** "Need to talk to someone?" 911 is always here (it opens the phone's dialer; Bantay never dials an emergency call itself).
 *  Every other number comes from the listed rows in safety/hotlines.json (status LISTED or CONFIRMED, not verified by Bantay), never typed here. */
export default function CrisisCard({ rows = hotlines }: { rows?: readonly HotlineRow[] }) {
  const lines = crisisLines(rows)
  const src = lines[0]
  const [first, ...rest] = lines.flatMap((l) => l.numbers.map((n) => ({ n, net: l.network })))
  return (
    <section className="card cm-crisis" data-testid="calm-crisis" aria-labelledby="cm-crisis-h">
      <h2 id="cm-crisis-h" className="cm-crisis-t">Need to talk to someone?</h2>
      <p className="cm-sub"><b>If someone is in danger now, call 911.</b></p>
      <a className="btn block cm-911" href="tel:911">Call 911</a>
      {src && first && (
        <>
          <p className="cm-sub">{src.name}</p>
          <a className="btn block cm-start" href={telHref(first.n)}>Call {first.n}</a>
          <div className="cm-nums">
            {rest.map(({ n, net }) => <a key={n} className="cm-call" href={telHref(n)}>Call {n}{net && <span className="cm-net">{net}</span>}</a>)}
          </div>
          <p className="cm-sub">Source: <a href={src.sourceUrl} target="_blank" rel="noopener noreferrer" className="cm-src">{new URL(src.sourceUrl).hostname.replace(/^www\./, '')}</a>, listed {src.date}</p>
        </>
      )}
    </section>
  )
}
