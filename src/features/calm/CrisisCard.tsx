import hotlines from '../../data/safety/hotlines.json'
import { crisisLines, telHref } from './crisis'

const LINES = crisisLines(hotlines)

/** "Need to talk to someone?" Every number comes from the verified rows in safety/hotlines.json, never typed here. */
export default function CrisisCard() {
  const [first, ...rest] = LINES.flatMap((l) => l.numbers)
  const src = LINES[0]
  if (!first || !src) return null
  return (
    <section className="card cm-crisis" data-testid="calm-crisis" aria-labelledby="cm-crisis-h">
      <h2 id="cm-crisis-h" className="cm-crisis-t">Need to talk to someone?</h2>
      <p className="cm-sub"><b>If someone is in danger now, call 911.</b></p>
      <p className="cm-sub">NCMH Crisis Hotline, free to call, 24/7</p>
      <a className="btn block cm-start" href={telHref(first)}>Call {first}</a>
      <div className="cm-nums">
        {rest.map((n) => <a key={n} className="cm-call" href={telHref(n)}>Call {n}</a>)}
      </div>
      <p className="cm-sub">Source: <a href={src.sourceUrl} target="_blank" rel="noopener noreferrer" className="cm-src">{new URL(src.sourceUrl).hostname.replace(/^www\./, '')}</a>, listed {src.date}</p>
    </section>
  )
}
