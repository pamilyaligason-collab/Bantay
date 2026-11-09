import { useEffect, useState } from 'react'
import { Section } from '../look'
import { track } from '../admin/events'
import { latestPerGame, useLotto, type LottoRow } from './lottoApi'
import './lotto.css'

export const LOTTO_NOTE = 'Source: lottopcso.com (unofficial).'
export const PCSO_URL = 'https://www.pcso.gov.ph/'
const SHOWN = 3
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/** "Sat 7 Nov" from a yyyy-mm-dd draw date (a calendar day, no time zone). */
export function drawDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`)
  return Number.isNaN(d.getTime()) ? iso : `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`
}
/** Winner line for the 6/xx games only (3D posts many winners and no jackpot story); null when PCSO gave no count. */
const winnerLine = (r: LottoRow): string | null => (!/6\/\d\d/.test(r.game) || r.winners === null ? null : r.winners === 0 ? 'no winner' : `${r.winners} ${r.winners === 1 ? 'winner' : 'winners'}`)
const balls = (r: LottoRow) => r.combination.split('-').map((n) => (n.length < 2 && /6\/\d\d/.test(r.game) ? n.padStart(2, '0') : n))

/** S24: lottopcso.com results (unofficial mirror, D-153) as one card, latest draw per game (6/58, 6/55, 6/49, 6/45, 6/42, 3D, newest draw time). The newest three show first; "More games" opens the rest. Hidden when there are no rows. */
export default function Lotto() {
  const { rows } = useLotto()
  const [all, setAll] = useState(false)
  const latest = rows ? latestPerGame(rows) : []
  const has = latest.length > 0
  useEffect(() => { if (has) void track('action', 'card_lotto') }, [has]) // the card was shown (D-160)
  if (!latest.length) return null
  const byDate = [...latest].sort((a, b) => (a.draw_date < b.draw_date ? 1 : a.draw_date > b.draw_date ? -1 : 0)) // stable: ties keep game order
  const top = new Set(byDate.slice(0, SHOWN))
  const shown = all ? latest : latest.filter((r) => top.has(r))
  return (
    <Section title="Lotto results" link={latest.length > SHOWN ? { onClick: () => setAll((v) => !v), label: all ? 'Fewer games' : 'More games' } : undefined} testId="today-lotto">
      <div className="card lotto">
        {shown.map((r) => {
          const w = winnerLine(r)
          return (
            <div key={r.game} className="lotto-row">
              <div className="lotto-head"><span className="lotto-name">{r.game}</span><span className="lotto-sub">{drawDay(r.draw_date)}{w ? ` · ${w}` : ''}</span></div>
              <span className="lotto-balls">{balls(r).map((n, i) => <span key={i} className="lotto-ball">{n}</span>)}</span>
            </div>
          )
        })}
        <p className="lotto-note">{LOTTO_NOTE}</p>
        <a className="lotto-pcso" href={PCSO_URL} target="_blank" rel="noopener noreferrer" onClick={() => void track('action', 'card_lotto')}>Check your ticket with PCSO</a>
      </div>
    </Section>
  )
}
