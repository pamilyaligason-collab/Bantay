import { useEffect, useState } from 'react'
import { GroupedList, Row, Section, useReducedMotion } from '../look'
import { BreathOrb } from '../look/BreathOrb'
import { useKv } from '../shell/useKv'
import { useActing } from '../viewas/viewAs'
import { cycleSecs, momentAt, SHOWN_PATTERNS, type SelfCareEntry } from './breathLogic'
import './todayCalm.css'

/** Board "Calm": an idle breathing orb, navy like the Calm page, that opens the full Calm screen (#calm, D-142). The Relaxing radio row opens the Listen and watch section on Calm. */
export default function CalmCard() {
  const p = SHOWN_PATTERNS[0]!
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
      <a href="#calm" className="card td-calm cc-navy press" aria-label="Breathe for 1 minute">
        <BreathOrb moment={momentAt(p, 1, elapsed)} reduced={reduced} size={84} floor={0.78} />
        <span className="td-grow"><b>Breathe for 1 minute</b><span>{p.tag}. {done ? 'Done today.' : 'Not done yet today.'}</span></span>
      </a>
      <GroupedList icons><Row icon="play" tint="teal" title="Relaxing radio" sub="Soft music and talks" href="#calm/listen" /></GroupedList>
    </Section>
  )
}
