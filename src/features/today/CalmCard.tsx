import { useEffect, useState } from 'react'
import { GroupedList, Row, Section, useReducedMotion } from '../look'
import { BreathOrb } from '../look/BreathOrb'
import { useKv } from '../shell/useKv'
import { useActing } from '../viewas/viewAs'
import BreathSheet from './BreathSheet'
import { cycleSecs, momentAt, SHOWN_PATTERNS, type SelfCareEntry } from './breathLogic'

/** Board "Calm": an idle breathing orb that opens the breath sheet. The Relaxing radio row opens the Listen and watch section on Calm. */
export default function CalmCard() {
  const p = SHOWN_PATTERNS[0]!
  const [open, setOpen] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const reduced = useReducedMotion()
  const [log] = useKv<SelfCareEntry[]>('selfcare.log', [])
  useEffect(() => {
    if (reduced) return
    const t0 = Date.now()
    const id = setInterval(() => setElapsed(((Date.now() - t0) / 1000) % cycleSecs(p)), 250)
    return () => clearInterval(id)
  }, [reduced, p])
  const { acting } = useActing() // selfcare.log is not by person: the admin's own breaths are not the viewed person's
  const done = !acting && log.some((e) => new Date(e.at).toDateString() === new Date().toDateString())
  return (
    <Section title="Calm" link={{ href: '#calm', label: 'Open Calm' }} testId="calm">
      <button type="button" className="card td-calm press" onClick={() => setOpen(true)} aria-label="Breathe for 1 minute">
        <BreathOrb moment={momentAt(p, 1, elapsed)} reduced={reduced} size={84} floor={0.78} />
        <span className="td-grow"><b>Breathe for 1 minute</b><span>{p.tag}. {done ? 'Done today.' : 'Not done yet today.'}</span></span>
      </button>
      <GroupedList icons><Row icon="play" tint="teal" title="Relaxing radio" sub="Soft music and talks" href="#calm/listen" /></GroupedList>
      {open && <BreathSheet onClose={() => setOpen(false)} />}
    </Section>
  )
}
