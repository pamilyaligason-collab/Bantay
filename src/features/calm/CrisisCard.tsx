import hotlines from '../../data/safety/hotlines.json'
import { crisisLines, telHref, type HotlineRow } from './crisis'

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
