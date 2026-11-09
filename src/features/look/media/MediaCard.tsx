import { useState, type MouseEvent } from 'react'
import { Icon } from '../../shell/Icon'
import './media.css'

export type MediaVariant = 'hero' | 'row' | 'half'
export interface MediaCardProps {
  variant: MediaVariant
  /** The YouTube id: the still comes from i.ytimg.com (no cookies, no referrer). */
  id: string
  title: string
  channel: string
  minutes?: number | null
  /** Short age such as "40 min ago"; shown after the channel on the same line. */
  age?: string
  /** A label only when it adds meaning (for example "Most watched"). */
  tag?: string
  /** One short line under the meta (for example a salt reminder). */
  note?: string
  /** A link card when given, else a button card. */
  href?: string
  onClick?: (e: MouseEvent<HTMLElement>) => void
  pressed?: boolean
  testId?: string
}

/** D-180 name: "Video, title, channel, [age,] [note,] [tag,] length". The words follow the card's text order (the body comes first in the markup, CSS moves the still ahead), so the name holds every visible word in order (WCAG 2.5.3); the length is left out when not recorded. */
export const mediaName = (title: string, channel: string, minutes?: number | null, tag?: string, age?: string, note?: string) =>
  ['Video', title, channel, age, note, tag, minutes != null && minutes > 0 ? `${minutes} min` : null].filter(Boolean).join(', ')

/** One video preview card (contract "Media card"): 16:9 still with a same-size placeholder, play circle, length badge, a 2-line title, channel and age. The whole card is one link or button. */
export function MediaCard(p: MediaCardProps) {
  const [off, setOff] = useState(false)
  const len = p.minutes != null && p.minutes > 0 ? `${p.minutes} min` : null
  const cls = `md md-${p.variant}${p.pressed ? ' is-on' : ''}`
  // The {' '} text nodes keep the words apart in the card's text (axe label-in-name reads them joined otherwise).
  const body = (
    <>
      <span className="md-body">
        <span className="md-title cd-title">{p.title}</span>{' '}
        <span className="md-meta cd-meta">{p.channel}{p.age ? ` · ${p.age}` : ''}</span>{' '}
        {p.note && <span className="md-line cd-meta">{p.note}</span>}
      </span>{' '}
      <span className="md-pic">
        {!off && <img src={`https://i.ytimg.com/vi/${p.id}/mqdefault.jpg`} alt="" width={320} height={180} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setOff(true)} />}
        <span className="md-play" aria-hidden="true"><Icon name="play" size={p.variant === 'hero' ? 28 : 18} /></span>
        {p.tag && <span className="md-flag" aria-hidden="true">{p.tag}</span>}{' '}
        {len && <span className="md-len" aria-hidden="true">{len}</span>}
      </span>
    </>
  )
  const name = mediaName(p.title, p.channel, p.minutes, p.tag, p.age, p.note)
  const hero = p.variant === 'hero' ? true : undefined // one per section (screens count them)
  return p.href !== undefined
    ? <a className={cls} href={p.href} aria-label={name} data-hero={hero} data-testid={p.testId} onClick={p.onClick}>{body}</a>
    : <button type="button" className={cls} aria-label={name} aria-pressed={p.pressed} data-hero={hero} data-testid={p.testId} onClick={p.onClick}>{body}</button>
}
