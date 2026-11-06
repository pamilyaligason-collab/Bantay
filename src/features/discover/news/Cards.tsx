import { Icon } from '../../shell/Icon'
import { useState } from 'react'
import { ago } from './Screen'
import { hueOf, initialOf, topicOf, TOPIC_LABEL, type NewsRow } from './model'
import { toggleSaved } from './saved'

const secure = (u: string | null | undefined): u is string => !!u && /^https:\/\//i.test(u)

/** The story picture (no cookies, no referrer). No picture, a failed load or offline: a coloured tile with the source's first letter. */
export function NewsPic({ n, w, h, className }: { n: NewsRow; w: number; h: number; className: string }) {
  const [bad, setBad] = useState(false)
  const show = secure(n.image_url) && !bad
  return (
    <span className={className} data-hue={hueOf(n.source)} data-fallback={show ? undefined : 'true'}>
      {show
        ? <img src={n.image_url!} alt="" width={w} height={h} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setBad(true)} />
        : <span className="nw-mark" aria-hidden="true">{initialOf(n.source)}</span>}
    </span>
  )
}

const meta = (n: NewsRow, now: number) => {
  const t = topicOf(n)
  return `${t ? TOPIC_LABEL[t] + ' · ' : ''}${ago(n.published_at, now)}`
}
const Out = () => <span className="dc-sr"> (opens the news site)</span>

/** Large image card: the source name sits on the card, never only in the picture. */
export function LeadCard({ n, now, testId }: { n: NewsRow; now: number; testId?: string }) {
  return (
    <a className="card nw-lead" href={n.url} target="_blank" rel="noopener noreferrer" data-testid={testId}>
      <NewsPic n={n} w={358} h={180} className="nw-lead-pic" />
      <span className="nw-body">
        <span className="nw-src">{n.source}<span className="nw-dot"> · </span>{meta(n, now)}</span>
        <b className="nw-title">{n.title}<Out /></b>
      </span>
    </a>
  )
}

/** Row with the picture on the right. */
export function StoryRow({ n, now }: { n: NewsRow; now: number }) {
  return (
    <a className="nw-item" href={n.url} target="_blank" rel="noopener noreferrer" data-testid="nw-story">
      <span className="nw-body"><span className="nw-src">{n.source}</span><b className="nw-title">{n.title}<Out /></b><span className="nw-meta">{meta(n, now)}</span></span>
      <NewsPic n={n} w={72} h={72} className="nw-thumb" />
    </a>
  )
}

/** Latest row: a link plus a separate 44 px Read later button (saved = filled, press again to remove). */
export function LatestRow({ n, now, saved }: { n: NewsRow; now: number; saved: boolean }) {
  return (
    <div className="nw-item" data-testid="nw-latest">
      <a className="nw-body" href={n.url} target="_blank" rel="noopener noreferrer"><span className="nw-src">{n.source}</span><b className="nw-title">{n.title}<Out /></b><span className="nw-meta">{meta(n, now)}</span></a>
      <button type="button" className="nw-save" aria-pressed={saved} aria-label={`${saved ? 'Remove from read later' : 'Read later'}: ${n.title}`} onClick={() => toggleSaved(n)}><Icon name={saved ? 'check' : 'plus'} size={20} /></button>
    </div>
  )
}
