import type { Moment } from '../today/breathLogic'
import { PHASE_WORD } from '../today/breathLogic'

/** Breathing orb (C-10). L0 stub: a static disc and the phase word; L9 replaces the body with the GSAP orb (props stay). */
export function BreathOrb({ moment, reduced, size = 160 }: { moment: Moment; reduced?: boolean; size?: number }) {
  return (
    <div className="bo-stub" data-reduced={reduced || undefined} style={{ width: size, height: size, borderRadius: '50%', background: 'var(--soft)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span role="status">{moment.done ? 'Done' : PHASE_WORD[moment.phase]}</span>
    </div>
  )
}
