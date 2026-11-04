import { useEffect, useRef, useState } from 'react'
import { useKv } from '../../shell/useKv'
import { MEDCARDS, RECIPES } from '../learn/data'
import { articleText } from '../learn/pick'
import { MEDCARDS_FLAG } from '../learn/Screen'
import { speak, stopSpeaking } from './speech'

/** What can be read aloud (recipes, plus medicine cards once the clinician has signed them) and which one is playing. One at a time; leaving the screen stops the voice. Shared by Listen and the Discover overview. */
export function useReadAloud() {
  const [medcards] = useKv<boolean>(MEDCARDS_FLAG, false)
  const [playing, setPlaying] = useState<string | null>(null)
  const turn = useRef(0) // a finished older read must not clear a newer one
  useEffect(() => () => { turn.current++; void stopSpeaking() }, [])
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
  return { items, playing, toggle }
}
