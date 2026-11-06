import { useEffect, useRef } from 'react'
import { circleScale, PHASE_WORD, type Moment, type Phase } from '../today/breathLogic'
import { DotSphere } from './DotSphere'
import { loadGsap } from './gsap'
import './orb.css'
import { useReducedMotion } from './useReducedMotion'

const STILL = 0.78 // reduced motion: one fixed scale, whatever the moment
const END: Record<Phase, number> = { in: 1, hold: 1, out: 0.55, rest: 0.55 } // scale at the end of each phase (matches circleScale)
const startScale = (m: Moment) => circleScale(m, m.phase === 'hold' ? 'in' : null)

/** Breathing orb (S22-C): a dotted sphere on a glow. The scale follows the phases of `momentAt` (0.55 to 1 in, hold, 1 to 0.55 out, rest) with one GSAP tween per phase;
 *  the word and the count sit inside. Reduced motion (or `reduced`): no tween and one fixed mid scale; only the word and count change. */
export function BreathOrb({ moment, reduced, size = 160, floor }: { moment: Moment; reduced?: boolean; size?: number; floor?: number }) {
  const sys = useReducedMotion()
  const still = reduced ?? sys
  const el = useRef<HTMLDivElement>(null)
  const tween = useRef<{ kill: () => void } | null>(null)
  const sc = (v: number) => (floor == null ? v : floor + ((1 - floor) * (v - 0.55)) / 0.45) // floor: the smallest scale (Today's idle orb breathes .78 to 1 as on board Main); undefined keeps .55 to 1
  const k = moment.done ? 'done' : `${moment.cycle}:${moment.phase}`
  const latest = useRef(moment)
  latest.current = moment
  useEffect(() => {
    const node = el.current
    const m = latest.current
    if (!node) return
    tween.current?.kill()
    tween.current = null
    node.style.transform = `scale(${still ? STILL : sc(m.done ? 0.55 : startScale(m))})`
    if (still || m.done) return
    const secs = m.secs * (1 - m.into)
    if (END[m.phase] === startScale(m) || secs <= 0) return
    let dead = false
    loadGsap().then((g) => {
      if (dead) return
      tween.current = g.to(node, { scale: sc(END[m.phase]), duration: secs, ease: m.into > 0 ? 'none' : 'sine.inOut' })
    }).catch(() => undefined)
    return () => { dead = true; tween.current?.kill() }
  }, [k, still]) // one tween per phase: re-run when the phase changes, not every second
  const word = moment.done ? 'Done' : PHASE_WORD[moment.phase]
  return (
    <div className="bo" data-phase={moment.done ? 'done' : moment.phase} data-reduced={still || undefined} style={{ width: size, height: size }}>
      <div className="bo-orb" ref={el} aria-hidden="true"><b className="bo-glow" /><DotSphere size={size} /></div>
      <div className="bo-label">
        <span role="status" className="bo-word">{word}</span>
        {!moment.done && <span className="bo-count" aria-hidden="true">{moment.left}</span>}
      </div>
    </div>
  )
}
