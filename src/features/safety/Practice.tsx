import practice from '../../data/safety/practice.json'
import { NOT_A_SIREN } from './alerts'
import './safety.css'

type Card = (typeof practice)[number]
export const CARDS = practice as Card[]

/** Simple drawn card. Original artwork, no third-party poster. */
export function Poster({ card }: { card: Card }) {
  const h = 56 + card.poster.length * 52
  return (
    <svg className="sf-poster" viewBox={`0 0 320 ${h}`} role="img" aria-label={`${card.title} poster: ${card.poster.join(', ')}`}>
      <rect width="320" height={h} rx="20" fill="var(--btn)" />
      <text x="20" y="38" fontSize="20" fontWeight="700" fill="var(--btn-fg)">{card.title}</text>
      {card.poster.map((t, i) => (
        <g key={t}>
          <circle cx="36" cy={78 + i * 52} r="16" fill="var(--btn-fg)" />
          <text x="36" y={84 + i * 52} fontSize="18" fontWeight="700" textAnchor="middle" fill="var(--btn)">{i + 1}</text>
          <text x="64" y={85 + i * 52} fontSize="22" fontWeight="700" fill="var(--btn-fg)">{t}</text>
        </g>
      ))}
    </svg>
  )
}

const PARTS = [['Before', 'before'], ['During', 'during'], ['After', 'after']] as const

export function PracticeCard({ card }: { card: Card }) {
  return (
    <details>
      <summary>{card.title}</summary>
      {card.id === 'earthquake' || card.id === 'tsunami' ? <p className="sf-note">{NOT_A_SIREN}</p> : null}
      {card.local ? <p><strong>{card.local}</strong></p> : null}
      {PARTS.map(([label, k]) => (
        <div key={k}>
          <h3>{label}</h3>
          <ul>{card[k].map((t) => <li key={t}>{t}</li>)}</ul>
        </div>
      ))}
      <Poster card={card} />
      <p className="sub" style={{ fontSize: 13 }}>
        Written in our own words from{' '}
        {card.sources.map(([n, u], i) => (
          <span key={u}>{i ? ', ' : ''}<a href={u} target="_blank" rel="noopener noreferrer">{n}</a></span>
        ))}
        . Posters are drawn for Bantay.
      </p>
    </details>
  )
}

export default function Practice() {
  return (
    <div className="sf">
      {CARDS.map((c) => <PracticeCard key={c.id} card={c} />)}
    </div>
  )
}
