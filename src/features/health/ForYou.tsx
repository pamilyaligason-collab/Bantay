import { useMemo, useState } from 'react'
import { Icon } from '../shell/Icon'
import { Section } from '../look'
import { videoOfTheDay } from '../today/videos'
import type { Attention } from './attention'
import { NudgeRow } from './GlanceGrid'
import { articleHref } from './library/medline'
import { playable, VIDEOS, type Video } from './library/videosLogic'
import { metricLabel } from './model'
import type { Reading } from './ranges'
import './health.css'

/** Up to two checked videos: today's pick, then one tied to the lead result when there is a match (blood sugar -> Diabetes), else the next one on the list. Each carries its reason. */
export function forYouClips(list: Video[], attentionTest: string | null, now = new Date()): { video: Video; reason: string }[] {
  if (!list.length) return []
  const first = videoOfTheDay(now, list)
  const tied = attentionTest && /glucose/.test(attentionTest) ? list.find((v) => v.topic === 'Diabetes' && v !== first) : undefined
  const second = tied ?? (list.length > 1 ? list[(list.indexOf(first) + 1) % list.length] : undefined)
  return [{ video: first, reason: "Today's pick" }, ...(second ? [{ video: second, reason: tied ? `Because of your ${metricLabel(attentionTest!)}` : 'Also checked' }] : [])]
}

/** One video card: its YouTube still (i.ytimg.com, no cookies, no referrer), its length when known and the reason it is here. If the still cannot load, a plain tile with the play mark stands in (as LiteVideo does). */
function Clip({ video, reason, testId }: { video: Video; reason: string; testId: string }) {
  const [bad, setBad] = useState(false)
  return (
    <a className="card fy-video press" href="#discover/watch" data-testid={testId}>
      <span className="fy-poster" data-still={bad ? 'off' : 'on'}>
        {!bad && <img className="fy-img" src={`https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setBad(true)} />}
        <span className="fy-play" aria-hidden="true"><Icon name="play" size={24} /></span>
        {video.minutes != null && <span className="fy-len">{video.minutes} min</span>}
      </span>
      <span className="pt-k">{reason}</span>
      <b>{video.title}</b>
      <span className="sub">{video.source}</span>
    </a>
  )
}

/** For you, top to bottom: today's videos (stills, two across), "Because of you" tied to the lead result, then the small log row. No data means no log row and no article. */
export function ForYou({ personId, readings, attention, canLog, onAdd }: { personId: string; readings: Reading[]; attention: Attention | null; canLog: boolean; onAdd: (code: 'bp' | 'fasting_glucose') => void }) {
  const clips = useMemo(() => forYouClips(VIDEOS.filter(playable), attention?.reading.test ?? null), [attention?.reading.test])
  const label = attention ? metricLabel(attention.reading.test) : null
  return (
    <Section title="For you" testId="for-you">
      <div className="fy-stack">
        {clips.length > 0 && <div className="fy-vids">{clips.map((c, i) => <Clip key={c.video.id} video={c.video} reason={c.reason} testId={i ? 'foryou-video-2' : 'foryou-video'} />)}</div>}
        {label && (
          <a className="card fy-link press" href={articleHref('s', label)} data-testid="foryou-because">
            <span className="pt-k">Because of your {label}</span>
            <b>A short, checked explainer</b>
            <span className="sub">Read</span>
          </a>
        )}
        {readings.length > 0 && <div data-testid="foryou-log"><NudgeRow personId={personId} readings={readings} canLog={canLog} onAdd={onAdd} /></div>}
      </div>
    </Section>
  )
}
