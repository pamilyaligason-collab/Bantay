import { useEffect, useState } from 'react'
import { Icon } from '../../shell/Icon'
import Facts from './Facts'
import Memory from './Memory'
import Trivia from './Trivia'
import WordSearch from './WordSearch'
import { gamesToday, playedToday } from './score'
import './play.css'

type Page = 'hub' | 'memory' | 'wordsearch' | 'trivia' | 'facts'

/** Discover > Play: three games made inside the app (no timer, no score, no loser), Alam mo ba?, and Fun facts. Games are local only: nothing is sent anywhere. */
export default function PlayScreen() {
  const [page, setPage] = useState<Page>('hub')
  const [today, setToday] = useState<{ n: number; games: string[] }>({ n: 0, games: [] })
  useEffect(() => {
    if (page !== 'hub') return
    let live = true
    void Promise.all([playedToday(), gamesToday()]).then(([n, games]) => { if (live) setToday({ n, games }) })
    return () => { live = false }
  }, [page])
  const back = () => setPage('hub')
  if (page === 'memory') return <Memory onBack={back} />
  if (page === 'wordsearch') return <WordSearch onBack={back} />
  if (page === 'trivia') return <Trivia onBack={back} />
  if (page === 'facts') return <Facts onBack={back} />
  return (
    <div className="fp" data-testid="play-hub">
      <section className="sh-card fp-row" aria-label="Played today">
        <span className="fp-ico"><Icon name="smile" /></span>
        <div className="sh-grow">
          <b>{today.n ? `Played today: ${today.n} ${today.n === 1 ? 'game' : 'games'}` : 'Nothing played yet today'}</b>
          <div className="sh-sub">{today.n ? `${today.games.join(', ')}. Nice work.` : 'Pick a game. There is no timer.'}</div>
        </div>
      </section>
      <div className="fp-tiles">
        <button type="button" className="fp-tile" onClick={() => setPage('memory')}><span className="fp-ico"><Icon name="smile" /></span><b>Memory match</b><span className="sh-sub">Find the pairs</span></button>
        <button type="button" className="fp-tile" onClick={() => setPage('wordsearch')}><span className="fp-ico"><Icon name="search" /></span><b>Word search</b><span className="sh-sub">English and Tagalog</span></button>
        <button type="button" className="fp-tile is-wide" onClick={() => setPage('trivia')}><span className="fp-ico"><Icon name="bolt" /></span><span className="fp-grow"><b>Alam mo ba?</b><span className="sh-sub">One fun question a day</span></span><Icon name="chev" /></button>
        <button type="button" className="fp-tile is-wide" onClick={() => setPage('facts')}><span className="fp-ico"><Icon name="sun" /></span><span className="fp-grow"><b>Fun facts today</b><span className="sh-sub">On this day and a Philippine fact</span></span><Icon name="chev" /></button>
      </div>
      <div className="fp-src"><Icon name="info" size={18} /><span>Games are made inside the app. Fun mental exercise only. No claim about memory or dementia.</span></div>
    </div>
  )
}
