import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useReducedMotion } from '../look'
import { BreathOrb } from '../look/BreathOrb'
import { LargeTitle } from '../look/LargeTitle'
import { loadFamily } from '../auth/family'
import { getMember } from '../auth/session'
import { JackSheet } from '../shell/JackSheet'
import { firstName } from '../shell/TopBar'
import { useKv } from '../shell/useKv'
import SosScreen from '../sos/SosScreen'
import BreathSheet from '../today/BreathSheet'
import { cycleSecs, momentAt, SHOWN_PATTERNS, type SelfCareEntry } from '../today/breathLogic'
import CrisisCard from './CrisisCard'
import MediaLinks from './MediaLinks'
import MoodCheck from './MoodCheck'
import './calm.css'

/** The one hero: an idle breathing orb (same loop as today/CalmCard) that opens the existing breath sheet. */
function Hero() {
  const p = SHOWN_PATTERNS[0]!
  const [open, setOpen] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const reduced = useReducedMotion()
  const [log] = useKv<SelfCareEntry[]>('selfcare.log', [])
  const [buzz, setBuzz] = useKv<boolean>('selfcare.buzz', true) // the key BreathSheet reads
  useEffect(() => {
    if (reduced) return
    const t0 = Date.now()
    const id = setInterval(() => setElapsed(((Date.now() - t0) / 1000) % cycleSecs(p)), 250)
    return () => clearInterval(id)
  }, [reduced, p])
  const done = log.some((e) => new Date(e.at).toDateString() === new Date().toDateString())
  return (
    <section className="card cm-hero" data-hero data-testid="calm-hero" aria-labelledby="cm-h">
      <BreathOrb moment={momentAt(p, 1, elapsed)} reduced={reduced} size={210} />
      <h2 id="cm-h" className="cm-hero-t">Breathe in… out</h2>
      <p className="cm-sub">{p.tag}</p>
      <button type="button" className="btn block cm-start" onClick={() => setOpen(true)}>Start</button>
      <div className="cm-buzz">
        <span><b>Gentle buzz</b><span className="cm-sub">Phone taps in and out</span></span>
        <button type="button" role="switch" aria-checked={buzz} aria-label="Gentle buzz" className="cm-tg" onClick={() => setBuzz(!buzz)}><i /></button>
      </div>
      <p className="cm-sub">After, you tell us: Worse · Same · Better</p>
      <p className="cm-done" role="status">{done ? 'Done once today' : 'Not done yet today'}</p>
      {open && <BreathSheet onClose={() => setOpen(false)} />}
    </section>
  )
}

/** #calm: the Calm page pushed under Today (v13 lane C). Its header Ask Jack is the only Jack entry here (the shell button is off on own-header routes). */
export default function CalmScreen() {
  const [jack, setJack] = useState(false)
  const [sos, setSos] = useState(false)
  const [name, setName] = useState('')
  const ask = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    let live = true
    void getMember().then((m) => {
      const n = m?.personId ? loadFamily().find((f) => f.personId === m.personId)?.displayName : ''
      if (live && n) setName(n)
    })
    return () => { live = false }
  }, [])
  return (
    <div className="cm" data-testid="calm">
      <LargeTitle back={{ href: '#today', label: 'Today' }} title="Calm" actions={<button ref={ask} type="button" className="cm-ask" aria-haspopup="dialog" onClick={() => setJack(true)}>Ask Jack</button>} />
      <Hero />
      <MoodCheck />
      <MediaLinks />
      <CrisisCard />
      {jack && <JackSheet onClose={() => { setJack(false); ask.current?.focus() }} onSos={() => { setJack(false); setSos(true) }} firstName={firstName(name)} />}
      {sos && createPortal(<div className="sh-sosfull" data-testid="sos-full"><SosScreen onClose={() => setSos(false)} /></div>, document.querySelector('.bt') ?? document.body)}
    </div>
  )
}
