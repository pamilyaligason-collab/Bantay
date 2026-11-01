import { useEffect, useState } from 'react'
import { GroupedList, Row, Section, useReducedMotion } from '../look'
import { BreathOrb } from '../look/BreathOrb'
import { useKv } from '../shell/useKv'
import BreathSheet from './BreathSheet'
import { cycleSecs, momentAt, SHOWN_PATTERNS, type SelfCareEntry } from './breathLogic'

/** Board "Calm": an idle breathing orb that opens the breath sheet. The radio row stays hidden until kv flag.calm.radio is on (default off; it opens the Listen and watch links on Calm). */
export default function CalmCard() {
  const p = SHOWN_PATTERNS[0]!
  const [open, setOpen] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const reduced = useReducedMotion()
  const [log] = useKv<SelfCareEntry[]>('selfcare.log', [])
  const [radio] = useKv<boolean>('flag.calm.radio', false)
  useEffect(() => {
    if (reduced) return
    const t0 = Date.now()
    const id = setInterval(() => setElapsed(((Date.now() - t0) / 1000) % cycleSecs(p)), 250)
    return () => clearInterval(id)
  }, [reduced, p])
  const done = log.some((e) => new Date(e.at).toDateString() === new Date().toDateString())
  return (
    <Section title="Calm" link={{ href: '#calm', label: 'Open Calm' }} testId="calm">
      <button type="button" className="card td-calm press" onClick={() => setOpen(true)} aria-label="Breathe for 1 minute">
        <BreathOrb moment={momentAt(p, 1, elapsed)} reduced={reduced} size={84} />
        <span className="td-grow"><b>Breathe for 1 minute</b><span>{p.tag}. {done ? 'Done today.' : 'Not done yet today.'}</span></span>
      </button>
      {radio && <GroupedList icons><Row icon="play" tint="teal" title="Relaxing radio" sub="Soft music and talks" href="#calm" /></GroupedList>}
      {open && <BreathSheet onClose={() => setOpen(false)} />}
    </Section>
  )
}
