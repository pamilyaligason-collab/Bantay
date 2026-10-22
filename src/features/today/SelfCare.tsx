import { useEffect, useRef, useState } from 'react'
import { Icon } from '../shell/Icon'
import { useKv } from '../shell/useKv'
import { addEntry, circleScale, MINUTES, momentAt, MOODS, PATTERNS, PHASE_WORD, SAFETY, totalSecs, type Pattern, type Phase, type SelfCareEntry } from './breathLogic'
import './selfcare.css'

type Stage = { s: 'pick' } | { s: 'run' } | { s: 'mood' } | { s: 'thanks'; mood: number | null }
const reduced = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
const buzz = () => { try { navigator.vibrate?.(15) } catch { /* no vibration on this phone */ } } // no native haptics helper in the app yet: the web call, quietly skipped where missing

/** Today's Self-care card (replaces the family line): a guided breathing exercise with an animated circle (a text countdown with reduced motion),
 *  then an optional 1-5 "how do I feel". The log stays on this phone (kv selfcare.log), private to the person holding it. */
export default function SelfCare() {
  const [log, setLog] = useKv<SelfCareEntry[]>('selfcare.log', [])
  const [buzzOn, setBuzzOn] = useKv<boolean>('selfcare.buzz', true)
  const [pat, setPat] = useState<Pattern>(PATTERNS[0]!)
  const [mins, setMins] = useState<number>(3)
  const [stage, setStage] = useState<Stage>({ s: 'pick' })
  const [elapsed, setElapsed] = useState(0)
  const prev = useRef<Phase | null>(null)
  const lastPhase = useRef<Phase | null>(null)
  const calm = reduced()

  useEffect(() => {
    if (stage.s !== 'run') return
    const t0 = Date.now()
    prev.current = null
    lastPhase.current = null
    setElapsed(0)
    const id = setInterval(() => {
      const e = (Date.now() - t0) / 1000
      setElapsed(e)
      if (e >= totalSecs(pat, mins)) { clearInterval(id); setStage({ s: 'mood' }) }
    }, 250)
    return () => clearInterval(id)
  }, [stage.s, pat, mins])

  const m = momentAt(pat, mins, elapsed)
  useEffect(() => { // a buzz at the start of each phase
    if (stage.s !== 'run') return
    if (lastPhase.current !== m.phase) { prev.current = lastPhase.current; lastPhase.current = m.phase; if (buzzOn) buzz() }
  }, [m.phase, m.cycle, stage.s, buzzOn])

  const finish = (mood: number | null) => {
    setLog(addEntry(log, { at: new Date().toISOString(), pattern: pat.id, minutes: mins, mood }))
    setStage({ s: 'thanks', mood })
  }
  const last = log.length ? log[log.length - 1]! : null
  const today = last && new Date(last.at).toDateString() === new Date().toDateString()

  return (
    <section className="card sc" aria-labelledby="sc-h" data-testid="selfcare">
      <h2 className="sc-h" id="sc-h">Take a breath</h2>
      {stage.s === 'pick' && (
        <>
          <p className="sc-lead">{pat.why}</p>
          <div className="sc-row" role="group" aria-label="Kind of breathing">
            {PATTERNS.map((p) => (
              <button key={p.id} type="button" className="sc-chip" aria-pressed={p.id === pat.id} onClick={() => setPat(p)}><b>{p.name}</b><span>{p.tag}</span></button>
            ))}
          </div>
          <div className="sc-row" role="group" aria-label="How long">
            {MINUTES.map((n) => <button key={n} type="button" className="sc-chip sc-min" aria-pressed={n === mins} onClick={() => setMins(n)}><b>{n} min</b></button>)}
          </div>
          <button type="button" className="btn sc-go" onClick={() => setStage({ s: 'run' })}><Icon name="play" size={22} />Start</button>
          <label className="sc-buzz"><input type="checkbox" checked={buzzOn} onChange={(e) => setBuzzOn(e.target.checked)} /> Gentle buzz on each breath</label>
          <p className="sub sc-note">{SAFETY}</p>
          <p className="sub sc-note">Source: <a href={pat.sourceUrl} target="_blank" rel="noreferrer">{pat.source}</a></p>
          {today && <p className="sub sc-note" role="status">Last time today: {last!.minutes} min{last!.mood ? `, felt ${MOODS[last!.mood - 1]!.word.toLowerCase()}` : ''}</p>}
        </>
      )}
      {stage.s === 'run' && (
        <div className="sc-run" data-testid="sc-run">
          <div className="sc-stage" aria-hidden="true">
            <div className="sc-circle" style={calm ? undefined : { transform: `scale(${circleScale(m, prev.current)})` }} />
            <div className="sc-count">{m.left}</div>
          </div>
          <p className="sc-phase" role="status" aria-live="polite">{PHASE_WORD[m.phase]}</p>
          <p className="sub">{pat.name}, breath {m.cycle} of {Math.round(totalSecs(pat, mins) / pat.steps.reduce((n, s) => n + s.secs, 0))}</p>
          <button type="button" className="btn2 sc-go" onClick={() => setStage({ s: 'pick' })}>End early</button>
        </div>
      )}
      {stage.s === 'mood' && (
        <div className="sc-mood">
          <p className="sc-lead">Well done. How do you feel now?</p>
          <div className="sc-row" role="group" aria-label="How do you feel">
            {MOODS.map((o) => <button key={o.v} type="button" className="sc-chip sc-face" onClick={() => finish(o.v)} aria-label={`${o.v} ${o.word}`}><span aria-hidden="true">{o.emoji}</span><b>{o.word}</b></button>)}
          </div>
          <button type="button" className="sc-skip" onClick={() => finish(null)}>Skip</button>
        </div>
      )}
      {stage.s === 'thanks' && (
        <div className="sc-mood">
          <p className="sc-lead" role="status">{stage.mood ? `Saved on this phone: ${MOODS[stage.mood - 1]!.word}.` : 'Done.'} Rest a moment.</p>
          <button type="button" className="btn2 sc-go" onClick={() => setStage({ s: 'pick' })}>Again</button>
        </div>
      )}
    </section>
  )
}
