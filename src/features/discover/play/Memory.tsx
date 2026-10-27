import { useEffect, useRef, useState } from 'react'
import { Icon } from '../../shell/Icon'
import { flip, hintPair, newMemory, notePlayed, pairsFound, PAIRS, praise, settle, solved } from './score'
import './play.css'

/** Memory match: 6 pairs, 12 big cards, no timer and no score. A pair that does not match turns back by itself. Ends with kind words. */
export default function Memory({ onBack, seed = Date.now() }: { onBack: () => void; seed?: number }) {
  const [round, setRound] = useState(0)
  const [s, setS] = useState(() => newMemory(seed))
  const [hint, setHint] = useState<[number, number] | null>(null)
  const counted = useRef(false)
  const done = solved(s)
  // two wrong cards turn back after a short pause
  useEffect(() => {
    if (s.open.length < 2) return
    const t = setTimeout(() => setS((x) => settle(x)), 900)
    return () => clearTimeout(t)
  }, [s])
  useEffect(() => { if (hint) { const t = setTimeout(() => setHint(null), 1500); return () => clearTimeout(t) } }, [hint])
  useEffect(() => { if (done && !counted.current) { counted.current = true; void notePlayed('Memory match') } }, [done])
  const again = () => { counted.current = false; setHint(null); setRound((r) => r + 1); setS(newMemory(seed + round + 1)) }
  return (
    <div className="fp" data-testid="memory">
      <div className="fp-head">
        <button type="button" className="sh-iconbtn" aria-label="Back to Play" onClick={onBack}><Icon name="back" /></button>
        <div><h2>Memory match</h2><span className="fp-note">{PAIRS} pairs, no timer</span></div>
      </div>
      <div className="fp-row fp-between"><span className="fp-chip" role="status">Pairs found: {pairsFound(s)} of {PAIRS}</span></div>
      <div className="fp-mem" role="group" aria-label="Cards">
        {s.cards.map((c, i) => {
          const shown = c.up || c.done
          return (
            <button key={i} type="button" className="fp-card" data-up={shown} data-done={c.done} data-hint={hint?.includes(i) || undefined}
              aria-label={shown ? c.label : `Card ${i + 1}, face down`} aria-disabled={c.done || undefined} onClick={() => setS((x) => flip(x, i))}>
              <span className="fp-in"><span className="fp-face fp-back"><Icon name="smile" size={28} /></span><span className="fp-face fp-front">{c.label}</span></span>
            </button>
          )
        })}
      </div>
      {done ? (
        <div className="sh-card" role="status"><b className="sh-h2">{praise(s.flips)}</b></div>
      ) : (
        <p className="fp-note" style={{ textAlign: 'center', margin: 0 }}>Tap two cards to turn them over.</p>
      )}
      <div className="fp-row">
        <button type="button" className="sh-pill sh-ghost sh-grow" disabled={done} onClick={() => setHint(hintPair(s))}><Icon name="bolt" size={20} /> Hint</button>
        <button type="button" className="sh-pill sh-ghost sh-grow" onClick={again}>{done ? 'Play again' : 'Start again'}</button>
      </div>
      <button type="button" className="sh-pill sh-primary sh-block" onClick={onBack}>Done for now</button>
    </div>
  )
}
