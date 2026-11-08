import { useState } from 'react'
import { EmptyState, MoreGrid, Section } from '../../look'
import { LiteVideo } from '../../media/LiteVideo'
import { Icon } from '../../shell/Icon'
import { ageBadge, NEWS_CHANNELS, updatedLine, useNewsVideos, type NewsVideo } from './api'
import './newsvideo.css'

/** The still picture (i.ytimg.com, no cookies, no referrer). If it cannot load it hides itself and the card keeps its text. */
function Still({ id }: { id: string }) {
  const [off, setOff] = useState(false)
  return off ? null : <img src={`https://i.ytimg.com/vi/${id}/mqdefault.jpg`} alt="" width={320} height={180} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setOff(true)} />
}

function NewsCard({ v, now, lead, on, pick }: { v: NewsVideo; now: number; lead?: boolean; on: boolean; pick: () => void }) {
  return (
    <button type="button" className={`card nv-card${lead ? ' nv-lead' : ''}`} aria-pressed={on} aria-label={`Play ${v.title}, ${v.channel}`} data-testid={lead ? 'nv-lead' : 'nv-card'} onClick={pick}>
      <span className="nv-pic"><Still id={v.video_id} /><span className="nv-age">{ageBadge(v.published_at, now)}</span><span className="nv-play" aria-hidden="true"><Icon name="play" size={lead ? 26 : 18} /></span></span>
      <span className="nv-body"><span className="nv-t">{v.title}</span><span className="nv-ch">{v.channel}</span></span>
    </button>
  )
}

/** Discover > Regional news (D-159): the newest videos from four Philippine news channels, filled every 30 minutes by the yt-feed function.
 *  A wide lead card (the newest), then a MoreGrid of cards; a tap picks the video and LiteVideo loads it only after its own tap. Hidden until the table is there and has been read once. */
export function NewsVideos({ now = Date.now() }: { now?: number }) {
  const [channel, setChannel] = useState<string | undefined>(undefined)
  const [sel, setSel] = useState<string | null>(null)
  const list = useNewsVideos(channel)
  if (!list) return null
  const [lead, ...rest] = list.rows
  const chosen = list.rows.find((v) => v.video_id === sel)
  return (
    <Section title="Regional news" meta={updatedLine(list.fetchedAt, now)} testId="dc-regional">
      <div className="nw">
        <div className="nw-chips nv-chips" role="group" aria-label="News channels">
          <button type="button" className="nw-chip" aria-pressed={!channel} onClick={() => { setChannel(undefined); setSel(null) }}>All</button>
          {NEWS_CHANNELS.map((c) => <button key={c.id} type="button" className="nw-chip" aria-pressed={channel === c.id} onClick={() => { setChannel(channel === c.id ? undefined : c.id); setSel(null) }}>{c.label}</button>)}
        </div>
        {chosen && (
          <div className="card dc-player" data-testid="nv-player">
            <LiteVideo key={chosen.video_id} id={chosen.video_id} title={chosen.title} />
            <span className="sub">{chosen.channel}</span>
          </div>
        )}
        {lead
          ? (
            <>
              <NewsCard v={lead} now={now} lead on={lead.video_id === sel} pick={() => setSel(lead.video_id)} />
              {rest.length > 0 && <MoreGrid label="More regional news" testId="nv-grid">{rest.map((v) => <NewsCard key={v.video_id} v={v} now={now} on={v.video_id === sel} pick={() => setSel(v.video_id)} />)}</MoreGrid>}
            </>
          )
          : <EmptyState icon="play" title="No news videos yet" body="New ones show up here every half hour." />}
      </div>
    </Section>
  )
}
