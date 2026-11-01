import { useEffect, useRef, useState } from 'react'
import { useReducedMotion } from '../look'
import { BreathOrb } from '../look/BreathOrb'
import { useKv } from '../shell/useKv'
import BreathSheet from '../today/BreathSheet'
import { cycleSecs, momentAt, SHOWN_PATTERNS, type SelfCareEntry } from '../today/breathLogic'

/** The buzz switch and the "done today" line. useKv reads once on mount and instances do not share state, so Hero remounts this (key) when the sheet closes. */
function HeroState() {
  const [log] = useKv<SelfCareEntry[]>('selfcare.log', [])
  const [buzz, setBuzz] = useKv<boolean>('selfcare.buzz', true) // the key BreathSheet reads
  const done = log.some((e) => new Date(e.at).toDateString() === new Date().toDateString())
  return (
    <>
      <div className="cm-buzz">
        <span><b>Gentle buzz</b><span className="cm-sub">Phone taps in and out</span></span>
        <button type="button" role="switch" aria-checked={buzz} aria-label="Gentle buzz" className="cm-tg" onClick={() => setBuzz(!buzz)}><i /></button>
      </div>
      <p className="cm-sub">After, you tell us: Worse · Same · Better</p>
      <p className="cm-done" role="status">{done ? 'Done once today' : 'Not done yet today'}</p>
    </>
  )
}

/** The one hero: an idle breathing orb (same loop as today/CalmCard) that opens the existing breath sheet. */
export default function CalmHero() {
  const p = SHOWN_PATTERNS[0]!
  const start = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [round, setRound] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const reduced = useReducedMotion()
  useEffect(() => {
    if (reduced || open) return // no idle loop under the sheet, which has its own orb
    const t0 = Date.now()
    const id = setInterval(() => setElapsed(((Date.now() - t0) / 1000) % cycleSecs(p)), 250)
    return () => clearInterval(id)
  }, [reduced, open, p])
  return (
    <section className="card cm-hero" data-hero data-testid="calm-hero" aria-labelledby="cm-h">
      <div aria-hidden="true" className="cm-orb"><BreathOrb moment={momentAt(p, 1, elapsed)} reduced={reduced} size={210} /></div>
      <h2 id="cm-h" className="cm-hero-t">Breathe in… out</h2>
      <p className="cm-sub">{p.tag}</p>
      <button ref={start} type="button" className="btn block cm-start" onClick={() => setOpen(true)}>Start</button>
      <HeroState key={round} />
      {open && <BreathSheet onClose={() => { setOpen(false); setRound((r) => r + 1); start.current?.focus() }} />}
    </section>
  )
}
