import { rainNowChip } from './rainNow'
import type { Wx } from '../today/heroCards'
import './rainNow.css'

/** S29 B: "Raining now" with where it comes from (airport report or model). Nothing when it is not raining or unknown. */
export default function RainNowChip({ rain }: { rain: Wx['rainingNow'] }) {
  const c = rainNowChip(rain)
  if (!c) return null
  return <span className="rn-chip" role="status" data-testid="rain-now"><b>{c.title}</b><span> · {c.source}</span></span>
}
