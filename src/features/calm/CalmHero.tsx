import { useEffect, useRef, useState } from 'react'
import { Segmented, useReducedMotion } from '../look'
import { BreathOrb } from '../look/BreathOrb'
import { DotSphere } from '../look/DotSphere'
import { Icon } from '../shell/Icon'
import { useKv } from '../shell/useKv'
import BreathSheet from '../today/BreathSheet'
import ScareSheet from './ScareSheet'
import { useActing } from '../viewas/viewAs'
import { cycleSecs, MINUTES, momentAt, SAFETY, SHOWN_PATTERNS, type Pattern, type SelfCareEntry } from '../today/breathLogic'

/** The buzz switch and the "done today" line. useKv reads once on mount and instances do not share state, so Hero remounts this (key) when the sheet closes. */
function HeroState() {
  const [stored] = useKv<SelfCareEntry[]>('selfcare.log', [])
  const log = useActing().acting ? [] : stored // not by person: while viewing, the admin's breaths are not the viewed person's
  const [buzz, setBuzz] = useKv<boolean>('selfcare.buzz', true) // the key BreathSheet reads
  const done = log.some((e) => new Date(e.at).toDateString() === new Date().toDateString())
  return (
    <>
      <div className="cm-buzz">
        <span><b>Gentle buzz</b><span className="cm-sub">Phone taps in and out</span></span>
        <button type="button" role="switch" aria-checked={buzz} aria-label="Gentle buzz" className="cm-tg" onClick={() => setBuzz(!buzz)}><i /></button>
      </div>
      <p className="cm-sub">After, you tell us: Worse · Same · Better</p>
      <p className="cm-done" role="status" data-done={done}>{done && <Icon name="flame" size={16} />}{done ? 'Done once today' : 'Not done yet today'}</p>
    </>
  )
}

/** Where the idle orb rests before Start: three quarters of the way through the breath in, so it is near the board's size (about 185 px of 220), not the 121 px bottom of the breath. */
export const restAt = (p: Pattern) => p.steps[0]!.secs * 0.75

/** Each exercise card's own sphere hue (board S22Calm). */
const HUE: Record<Pattern['id'], string> = { calm: '#8FB6FF', sleep: '#B49CFF', relax: '#7FE0D0' }

/** The board's pill words: the name and what the breath is. */
const patternLabel = (p: Pattern) => (p.id === 'calm' ? 'Calm box · 4-4-4-4' : p.id === 'relax' ? 'Relax · in 4, out 6' : p.name)

/** The one hero: an idle breathing orb on the chosen pattern's cycle, a pattern row and a length row, and Start, which opens the existing breath sheet on that pattern and length.
 *  Sleep (4-7-8) is not offered while SLEEP_478_ENABLED is off (clinician gate): the rows come from SHOWN_PATTERNS. */
export default function CalmHero() {
  const [pid, setPid] = useState<Pattern['id']>(SHOWN_PATTERNS[0]!.id)
  const [mins, setMins] = useState<string>('3')
  const p = SHOWN_PATTERNS.find((x) => x.id === pid)!
  const start = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [round, setRound] = useState(0)
  const [elapsed, setElapsed] = useState(() => restAt(SHOWN_PATTERNS[0]!))
  const reduced = useReducedMotion()
  useEffect(() => {
    if (reduced || open) return // no idle loop under the sheet, which has its own orb
    const t0 = Date.now()
    const id = setInterval(() => setElapsed((restAt(p) + (Date.now() - t0) / 1000) % cycleSecs(p)), 250)
    return () => clearInterval(id)
  }, [reduced, open, p])
  useEffect(() => setElapsed(restAt(p)), [p])
  return (
    <>
    <section className="card cm-hero" data-hero data-testid="calm-hero" aria-labelledby="cm-h">
      <div aria-hidden="true" className="cm-orb"><BreathOrb moment={momentAt(p, 1, elapsed)} reduced={reduced} size={220} /></div>
      <h2 id="cm-h" className="cm-hero-t">Breathe in… out</h2>
      <p className="cm-sub">{p.tag}</p>
      <Segmented label="Kind of breathing" value={pid} onChange={setPid} options={SHOWN_PATTERNS.map((x) => ({ id: x.id, label: patternLabel(x) }))} testId="calm-pattern" trailing={!SHOWN_PATTERNS.some((x) => x.id === 'sleep') && <button type="button" className="cm-soon" disabled>Sleep 4-7-8 · coming</button>} />
      <Segmented label="How long" value={mins} onChange={setMins} options={MINUTES.map((n) => ({ id: String(n), label: `${n} min` }))} testId="calm-length" />
      <button ref={start} type="button" className="btn block cm-start" onClick={() => setOpen(true)}>Start</button>
      <p className="cm-sub" data-testid="calm-safety">{SAFETY}</p>
      <HeroState key={round} />
      {open && <BreathSheet initial={{ pattern: pid, minutes: Number(mins) }} onClose={() => { setOpen(false); setRound((r) => r + 1); start.current?.focus() }} />}
    </section>
    <section className="cm-ex" aria-labelledby="cm-ex-h" data-testid="calm-exercises">
      <h2 id="cm-ex-h" className="cm-ex-t">Exercises</h2>
      {SHOWN_PATTERNS.map((x) => (
        <button key={x.id} type="button" className="cm-ex-b press" aria-pressed={pid === x.id} data-pattern={x.id} onClick={() => setPid(x.id)}>
          <span className="cm-ex-s" style={{ color: HUE[x.id] }} aria-hidden="true"><DotSphere size={64} rings={3} /></span>
          <span className="cm-ex-m"><b>{x.name}</b><span>{x.tag}</span></span>
          <span className="cm-ex-d">{mins} min</span>
        </button>
      ))}
    </section>
    </>
  )
}

/** "After a scare" sits after the crisis card (CalmScreen), so the crisis card keeps its place on the page. */
export function AfterScare() {
  const [scare, setScare] = useState(false)
  return (
    <section className="cm-ex" aria-label="After a scare">
      <button type="button" className="cm-ex-b press" data-testid="calm-scare-card" aria-haspopup="dialog" onClick={() => setScare(true)}>
        <span className="cm-ex-s" style={{ color: '#7FE0D0' }} aria-hidden="true"><DotSphere size={64} rings={3} /></span>
        <span className="cm-ex-m"><b>After a scare</b><span>5 things you see, 4 you hear</span></span>
        <span className="cm-ex-d">3 min</span>
      </button>
      {scare && <ScareSheet onClose={() => setScare(false)} />}
    </section>
  )
}
