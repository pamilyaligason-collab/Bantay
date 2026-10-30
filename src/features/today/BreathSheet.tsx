import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { JackArt } from '../look'
import { BreathOrb } from '../look/BreathOrb'
import { prefersReducedMotion } from '../look/useReducedMotion'
import { Icon } from '../shell/Icon'
import { useKv } from '../shell/useKv'
import { useSelfPersonId } from '../setup/useProfile'
import { addEntry, MINUTES, momentAt, MOOD3, moodWord, PHASE_WORD, SAFETY, SHOWN_PATTERNS, totalSecs, type Pattern, type Phase, type SelfCareEntry } from './breathLogic'
import './breath.css'

type Stage = { s: 'pick' } | { s: 'run' } | { s: 'mood' } | { s: 'thanks'; mood: number | null }
const buzz = () => { try { navigator.vibrate?.(15) } catch { /* no vibration on this phone */ } }

/** The breathing sheet (N-12, F-7, W-13..W-16, R10): pick a real pattern (with its why and source), the orb run on a breathing backdrop, then Worse / Same / Better with Jack well-done (Jack OR a tick, never both: D-103 rule 8).
 *  Back closes it: one history entry (`bantayBreathe`). The log stays on this phone (kv selfcare.log, with the person's id). */
export default function BreathSheet({ onClose }: { onClose: () => void }) {
  const [log, setLog] = useKv<SelfCareEntry[]>('selfcare.log', [])
  const [buzzOn, setBuzzOn] = useKv<boolean>('selfcare.buzz', true)
  const self = useSelfPersonId()
  const [pat, setPat] = useState<Pattern>(SHOWN_PATTERNS[0]!)
  const [mins, setMins] = useState<number>(3)
  const [stage, setStage] = useState<Stage>({ s: 'pick' })
  const [elapsed, setElapsed] = useState(0)
  const lastPhase = useRef<Phase | null>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  const pushed = useRef(false)
  const reduced = prefersReducedMotion()

  useEffect(() => { // system back closes the sheet; closing by hand removes the entry it pushed
    history.pushState({ bantayBreathe: true }, '')
    pushed.current = true
    const pop = () => { pushed.current = false; closeRef.current() }
    window.addEventListener('popstate', pop)
    return () => { window.removeEventListener('popstate', pop); if (pushed.current && history.state?.bantayBreathe) history.back() }
  }, [])

  useEffect(() => {
    if (stage.s !== 'run') return
    const t0 = Date.now()
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
    if (lastPhase.current !== m.phase) { lastPhase.current = m.phase; if (buzzOn) buzz() }
  }, [m.phase, m.cycle, stage.s, buzzOn])

  const finish = (mood: number | null) => {
    setLog(addEntry(log, { at: new Date().toISOString(), pattern: pat.id, minutes: mins, mood, personId: self }))
    setStage({ s: 'thanks', mood })
  }
  const last = log.length ? log[log.length - 1]! : null
  const today = last && new Date(last.at).toDateString() === new Date().toDateString()
  const sleepy = pat.id === 'sleep'

  return createPortal(
    <div className="td-sheet-wrap" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="td-sheet bs" role="dialog" aria-modal="true" aria-label="Take a breath" data-stage={stage.s} data-night={sleepy || undefined} onKeyDown={(e) => e.key === 'Escape' && onClose()}>
        {stage.s === 'run' && <div className="bs-back" aria-hidden="true" data-phase={m.phase} />}
        <div className="td-grab" />
        <div className="td-sheet-h"><h2>Take a breath</h2><button type="button" className="td-x" onClick={onClose} aria-label="Close">Close</button></div>
        {stage.s === 'pick' && (
          <>
            <p className="bs-lead">Pick a pattern.</p>
            <div className="bs-pats" role="group" aria-label="Kind of breathing">
              {SHOWN_PATTERNS.map((p) => (
                <div key={p.id} className="card bs-pat" data-hue="green" data-on={p.id === pat.id || undefined}>
                  <button type="button" className="bs-pat-b" aria-pressed={p.id === pat.id} onClick={() => setPat(p)}>
                    <span className="bs-pat-t"><b>{p.name}</b><span>{p.tag}</span></span>
                    {p.id === pat.id && <Icon name="check" size={20} />}
                  </button>
                  <p className="bs-why">{p.why}</p>
                  <a className="bs-src" href={p.sourceUrl} target="_blank" rel="noreferrer" aria-label={`Source: ${p.source}`}>Source</a>
                </div>
              ))}
            </div>
            <div className="bs-row" role="group" aria-label="How long">
              {MINUTES.map((n) => <button key={n} type="button" className="bs-chip" aria-pressed={n === mins} onClick={() => setMins(n)}>{n} min</button>)}
            </div>
            <label className="bs-buzz"><input type="checkbox" checked={buzzOn} onChange={(e) => setBuzzOn(e.target.checked)} /> Buzz with each breath</label>
            <button type="button" className="btn bs-go" onClick={() => setStage({ s: 'run' })}><Icon name="play" size={20} />Start</button>
            <p className="sub bs-note">{SAFETY}</p>
            {today && <p className="sub bs-note" role="status">Last time today: {last!.minutes} min{last!.mood ? `, felt ${moodWord(last!.mood).toLowerCase()}` : ''}</p>}
          </>
        )}
        {stage.s === 'run' && (
          <div className="bs-run" data-testid="sc-run">
            <BreathOrb moment={m} reduced={reduced} />
            <p className="bs-clock" aria-hidden="true">{String(Math.floor(Math.max(0, totalSecs(pat, mins) - elapsed) / 60)).padStart(2, '0')}:{String(Math.floor(Math.max(0, totalSecs(pat, mins) - elapsed) % 60)).padStart(2, '0')}</p>
            <p className="bs-phase" role="status" aria-live="polite">{PHASE_WORD[m.phase]}</p>
            <p className="sub">{pat.name}, breath {m.cycle}</p>
            <button type="button" className="btn2 bs-go" onClick={() => setStage({ s: 'pick' })}>End early</button>
          </div>
        )}
        {stage.s === 'mood' && (
          <div className="bs-mood">
            <JackArt name="well-done" size={96} decorative />
            <p className="bs-lead">Well done. How do you feel now?</p>
            <div className="bs-faces" role="group" aria-label="How do you feel">
              {MOOD3.map((o) => <button key={o.v} type="button" className="bs-face" onClick={() => finish(o.v)}>{o.word}</button>)}
            </div>
            <button type="button" className="bs-skip" onClick={() => finish(null)}>Skip</button>
          </div>
        )}
        {stage.s === 'thanks' && (
          <div className="bs-mood">
            <p className="bs-lead" role="status">{stage.mood ? `Saved on this phone: ${moodWord(stage.mood)}.` : 'Done.'} Rest a moment.</p>
            <button type="button" className="btn2 bs-go" onClick={() => setStage({ s: 'pick' })}>Again</button>
            <button type="button" className="btn bs-go" onClick={onClose}>Close</button>
          </div>
        )}
      </div>
    </div>,
    document.querySelector('.bt') ?? document.body
  )
}
