import { useEffect, useRef, useState } from 'react'
import { EmptyState } from '../../look'
import { Icon } from '../../shell/Icon'
import { useKv } from '../../shell/useKv'
import { MEDCARDS, RECIPES } from '../learn/data'
import { articleText } from '../learn/pick'
import { MEDCARDS_FLAG } from '../learn/Screen'
import { canSpeak, speak, stopSpeaking } from './speech'

/** Discover > Listen: recipes (and medicine cards, once the clinician has signed them) read aloud. One at a time; leaving the page stops the voice. */
export default function Listen() {
  const [medcards] = useKv<boolean>(MEDCARDS_FLAG, false)
  const [playing, setPlaying] = useState<string | null>(null)
  const turn = useRef(0) // a finished older read must not clear a newer one
  useEffect(() => () => { turn.current++; void stopSpeaking() }, [])

  if (!canSpeak()) return <EmptyState icon="info" title="Reading aloud is not on this phone" body="Your phone has no voice for it yet. You can still read every recipe in Learn." />

  const toggle = async (id: string) => {
    const mine = ++turn.current
    if (playing === id) { setPlaying(null); await stopSpeaking(); return }
    const text = articleText(id, { medcards })
    if (!text) return
    setPlaying(id)
    await speak(text)
    if (turn.current === mine) setPlaying(null)
  }

  const items = [
    ...RECIPES.map((r) => ({ id: r.id, title: r.name, sub: `Recipe, ${r.minutes} min` })),
    ...(medcards ? MEDCARDS.map((c) => ({ id: c.id, title: c.name, sub: 'Medicine card' })) : [])
  ]
  return (
    <div className="dc-list" data-testid="listen">
      <p className="sub dc-lead">Tap play and your phone reads it out loud.</p>
      {items.map((it) => {
        const on = playing === it.id
        return (
          <div key={it.id} className={`card dc-item${on ? ' is-on' : ''}`}>
            <span className="dc-grow"><b>{it.title}</b><span className="sub">{it.sub}</span></span>
            <button type="button" className="sh-iconbtn dc-play" aria-pressed={on} aria-label={`${on ? 'Stop' : 'Play'} ${it.title}`} onClick={() => void toggle(it.id)}>
              <Icon name={on ? 'pause' : 'play'} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
