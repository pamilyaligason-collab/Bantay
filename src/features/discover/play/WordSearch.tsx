import { useEffect, useMemo, useRef, useState } from 'react'
import { Icon } from '../../shell/Icon'
import en from '../../../data/play/words-en.json'
import fil from '../../../data/play/words-fil.json'
import { hintCell, lineBetween, makePuzzle, notePlayed, pickWords, wordAt } from './score'
import './play.css'

type Lang = 'fil' | 'en'
const LISTS: Record<Lang, string[]> = { fil: fil.words, en: en.words }

/** Word search 8 by 8, English or Tagalog. Words go across or down. Tap the first and the last letter of a word. */
export default function WordSearch({ onBack, seed = Date.now() }: { onBack: () => void; seed?: number }) {
  const [lang, setLang] = useState<Lang>('fil')
  const [round, setRound] = useState(0)
  const [found, setFound] = useState<string[]>([])
  const [start, setStart] = useState<[number, number] | null>(null)
  const [hint, setHint] = useState<[number, number] | null>(null)
  const [msg, setMsg] = useState('')
  const counted = useRef(false)
  const puzzle = useMemo(() => { const s = seed + round * 7919 + (lang === 'en' ? 1 : 0); return makePuzzle(pickWords(LISTS[lang], s), s) }, [lang, round, seed])
  const words = puzzle.placed.map((p) => p.word).sort()
  const done = found.length === puzzle.placed.length
  const foundCells = useMemo(() => new Set(puzzle.placed.filter((p) => found.includes(p.word)).flatMap((p) => lineBetween([p.r, p.c], [p.r + p.dr * (p.word.length - 1), p.c + p.dc * (p.word.length - 1)])!.map((c) => c.join(',')))), [puzzle, found])
  useEffect(() => { if (done && !counted.current) { counted.current = true; void notePlayed('Word search') } }, [done])
  const fresh = (l: Lang, nextRound: number) => { counted.current = false; setLang(l); setRound(nextRound); setFound([]); setStart(null); setHint(null); setMsg('') }
  const tap = (y: number, x: number) => {
    setHint(null)
    if (!start) { setStart([y, x]); setMsg(''); return }
    const w = wordAt(puzzle, start, [y, x])
    setStart(null)
    if (w && !found.includes(w)) { setFound((f) => [...f, w]); setMsg(`Found ${w}.`) } else setMsg('That line is not one of the words. Tap a first letter to try again.')
  }
  return (
    <div className="fp" data-testid="wordsearch">
      <div className="fp-head">
        <button type="button" className="sh-iconbtn" aria-label="Back to Play" onClick={onBack}><Icon name="back" /></button>
        <div><h2>Word search</h2><span className="fp-note">English and Tagalog</span></div>
      </div>
      <div className="sh-seg" role="group" aria-label="Word language">
        <button type="button" aria-pressed={lang === 'fil'} onClick={() => lang !== 'fil' && fresh('fil', round)}>Tagalog</button>
        <button type="button" aria-pressed={lang === 'en'} onClick={() => lang !== 'en' && fresh('en', round)}>English</button>
      </div>
      <div className="fp-ws" role="group" aria-label="Letters">
        {puzzle.grid.map((row, y) => row.map((ch, x) => {
          const k = `${y},${x}`
          const isStart = !!start && start[0] === y && start[1] === x
          return (
            <button key={k} type="button" className={`fp-cell${foundCells.has(k) ? ' is-found' : ''}${isStart ? ' is-start' : ''}${hint && hint[0] === y && hint[1] === x ? ' is-hint' : ''}`}
              aria-label={`${ch}, row ${y + 1}, column ${x + 1}`} onClick={() => tap(y, x)}>{ch}</button>
          )
        }))}
      </div>
      <p className="fp-note" role="status" style={{ margin: 0 }}>{done ? 'You found every word. Lovely!' : msg || 'Tap the first and last letter of a word. Words go across or down.'}</p>
      <div className="fp-words" aria-label="Words to find">{words.map((w) => <span key={w} className={`fp-chip${found.includes(w) ? ' is-done' : ''}`}>{w}</span>)}</div>
      <div className="fp-row">
        <button type="button" className="sh-pill sh-ghost sh-grow" disabled={done} onClick={() => setHint(hintCell(puzzle, found))}><Icon name="bolt" size={20} /> Hint</button>
        <button type="button" className="sh-pill sh-ghost sh-grow" onClick={() => fresh(lang, round + 1)}>New puzzle</button>
      </div>
      <button type="button" className="sh-pill sh-primary sh-block" onClick={onBack}>Done for now</button>
    </div>
  )
}
