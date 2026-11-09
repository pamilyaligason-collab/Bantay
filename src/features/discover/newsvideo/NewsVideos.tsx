import { useEffect, useRef, useState } from 'react'
import { EmptyState, Section } from '../../look'
import { MediaCard } from '../../look/media/MediaCard'
import { MediaList } from '../../look/media/MediaList'
import { LiteVideo } from '../../media/LiteVideo'
import { track } from '../../admin/events'
import { trackWatch } from '../channels'
import { ageText, updatedLine, useNewsVideos, type NewsVideo } from './api'

const card = (v: NewsVideo, now: number, on: boolean, pick: () => void, lead?: boolean) => (
  <MediaCard key={v.video_id} variant={lead ? 'hero' : 'row'} id={v.video_id} title={v.title} channel={v.channel} age={ageText(v.published_at, now)} pressed={on} onClick={pick} testId={lead ? 'nv-lead' : 'nv-card'} />
)

/** Discover > Regional news (D-159, S28): the newest videos from four Philippine news channels, filled every 30 minutes by the yt-feed function.
 *  The newest as a hero card, then rows (4 and Show more). No channel chips (S28): every channel shows together. A tap picks the video and LiteVideo loads it only after its own tap. Hidden until the table is there and has been read once. */
export function NewsVideos({ now = Date.now() }: { now?: number }) {
  const [sel, setSel] = useState<string | null>(null)
  const list = useNewsVideos()
  const player = useRef<HTMLDivElement>(null)
  useEffect(() => { if (sel) player.current?.querySelector<HTMLElement>('.lv-play, .lv-yt')?.focus() }, [sel]) // S26: the player takes focus when it opens
  if (!list) return null
  const [lead, ...rest] = list.rows
  const pick = (v: NewsVideo) => { setSel(v.video_id); void track('action', 'card_regional_video'); trackWatch(v.channel) }
  const chosen = list.rows.find((v) => v.video_id === sel)
  return (
    <Section title="Regional news" meta={list.rows.length && list.fetchedAt !== null ? updatedLine(list.fetchedAt, now) : undefined} testId="dc-regional">
      <div className="dc-stack">
        {chosen && (
          <div ref={player} className="card dc-player" data-testid="nv-player">
            <LiteVideo key={chosen.video_id} id={chosen.video_id} title={chosen.title} />
            <span className="sub">{chosen.channel}</span>
          </div>
        )}
        {lead
          ? (
            <>
              {card(lead, now, lead.video_id === sel, () => pick(lead), true)}
              {rest.length > 0 && <MediaList label="More regional news" testId="nv-grid">{rest.map((v) => card(v, now, v.video_id === sel, () => pick(v)))}</MediaList>}
            </>
          )
          : <EmptyState icon="play" title="No news videos yet" body="New ones show up here every half hour." />}
      </div>
    </Section>
  )
}
