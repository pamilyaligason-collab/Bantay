import { useEffect, useRef, useState } from 'react'
import { LargeTitle, Row, Section } from '../look'
import { Call911 } from './Call911'
import { LiteVideo } from '../media/LiteVideo'
import { Icon } from '../shell/Icon'
import { CPR_BPM, cueOf, makeClick, metronome } from './cprBeat'
import { TOPICS } from './FirstAid'
import './firstaid.css'

const topic = TOPICS.find((t) => t.id === 'cpr')

function Switch({ label, on, set }: { label: string; on: boolean; set: (v: boolean) => void }) {
  return <input type="checkbox" role="switch" className="cpr-sw" aria-label={label} checked={on} onChange={(e) => set(e.target.checked)} />
}

export default function Cpr() {
  const [run, setRun] = useState(false)
  const [dot, setDot] = useState(false)
  const [click, setClick] = useState(true)
  const [buzz, setBuzz] = useState(true)
  const opt = useRef({ click, buzz })
  opt.current = { click, buzz }
  const sound = useRef<(() => void) | null>(null)
  const online = typeof navigator === 'undefined' ? true : navigator.onLine

  useEffect(() => {
    if (!run) { setDot(false); return }
    const cue = cueOf()
    let off = 0
    const beat = () => {
      setDot(true); clearTimeout(off); off = window.setTimeout(() => setDot(false), 150)
      if (cue.click && opt.current.click) sound.current?.()
      if (cue.buzz && opt.current.buzz) navigator.vibrate?.(40)
    }
    beat()
    const stop = metronome(beat, CPR_BPM)
    return () => { stop(); clearTimeout(off) }
  }, [run])

  // audio must be created inside the tap
  const start = () => { if (!run && !sound.current) sound.current = makeClick(); setRun((r) => !r) }
  if (!topic) return null
  return (
    <>
      <LargeTitle title="CPR (hands-only)" back={{ href: '#safety/firstaid', label: 'First aid' }} />
      <div className="cpr">
        <Call911 />
        <div className="card cpr-beat" data-testid="cpr-beat">
          <span className="cpr-dot" data-on={dot} aria-hidden="true" />
          <h2>Push hard and fast</h2>
          <p>100 to 120 per minute. Push each time the dot flashes.</p>
          <button type="button" className="btn" onClick={start}>{run ? 'Stop' : 'Start'}</button>
          <div className="grp" role="list" aria-label="Beat cues">
            <Row title="Click" control={<Switch label="Click" on={click} set={setClick} />} />
            <Row title="Buzz" control={<Switch label="Buzz" on={buzz} set={setBuzz} />} />
          </div>
        </div>
        <Section title="Steps">
          <ol className="fa-steps" aria-label="Steps">
            {topic.steps.map((s, i) => <li key={i} className="card"><span className="fa-n" aria-hidden="true">{i + 1}</span><span>{s}</span></li>)}
          </ol>
        </Section>
        {online && topic.video && <LiteVideo id={topic.video.id} title={`${topic.video.title} (${topic.video.channel})`} />}
        <div className="card cpr-note"><b>Not trained? Hands-only CPR is OK.</b></div>
        <Section title="Sources">
          <ul className="fa-links">
            {topic.sources.map((s) => (
              <li key={s.url}><a href={s.url} target="_blank" rel="noopener noreferrer"><Icon name="out" size={18} />{s.label}<span className="lv-sr"> (opens in new tab)</span></a></li>
            ))}
          </ul>
        </Section>
        <p className="sub">Beat is {CPR_BPM} per minute.</p>
      </div>
    </>
  )
}
