import { useEffect, useRef, useState } from 'react'
import { Icon } from '../../shell/Icon'
import data from '../../../data/play/trivia.json'
import { dayKey, notePlayed, triviaIndex, triviaReply, type Trivia as Q } from './score'
import './play.css'

const QUESTIONS = data.questions as Q[]

/** Alam mo ba? One question a day. Marks the right answer and says why; a different pick is "Close!", never "wrong". */
export default function Trivia({ onBack, day = dayKey() }: { onBack: () => void; day?: string }) {
  const [skip, setSkip] = useState(0)
  const [pick, setPick] = useState<number | null>(null)
  const counted = useRef(false)
  const q = QUESTIONS[triviaIndex(day, QUESTIONS.length, skip)]!
  useEffect(() => { if (pick !== null && !counted.current) { counted.current = true; void notePlayed('Alam mo ba?') } }, [pick])
  const next = () => { counted.current = false; setPick(null); setSkip((s) => s + 1) }
  return (
    <div className="fp" data-testid="trivia">
      <div className="fp-head">
        <button type="button" className="sh-iconbtn" aria-label="Back to Play" onClick={onBack}><Icon name="back" /></button>
        <div><h2>Alam mo ba?</h2><span className="fp-note">{skip ? 'Another question' : "Today's question"}</span></div>
      </div>
      <div className="sh-card fp-q"><span className="sh-sub">{skip ? 'Another question' : "Today's question"}</span><h3>{q.q}</h3></div>
      <div className="fp-answers" role="group" aria-label="Answers">
        {q.a.map((a, i) => {
          const right = pick !== null && i === q.right
          return (
            <button key={a} type="button" className={`fp-ans${right ? ' is-right' : ''}${pick === i && i !== q.right ? ' is-mine' : ''}`} disabled={pick !== null} onClick={() => setPick(i)}>
              <b>{right ? <Icon name="check" size={18} /> : 'ABCD'[i]}</b><span>{a}</span>
              {pick === i && <span className="fp-note" style={{ marginLeft: 'auto' }}>Your answer</span>}
            </button>
          )
        })}
      </div>
      {pick !== null && (
        <div className="fp-ex" role="status"><b>{triviaReply(q, pick)}</b><span>{q.why} Fun, right?</span></div>
      )}
      <div className="fp-row">
        {pick !== null && <button type="button" className="sh-pill sh-ghost sh-grow" onClick={next}>Another question</button>}
        <button type="button" className="sh-pill sh-primary sh-grow" onClick={onBack}>Done</button>
      </div>
    </div>
  )
}
