import { useMemo, useState } from 'react'
import { MediaCard } from '../look/media/MediaCard'
import { MoreGrid, Section } from '../look'
import { videoOfTheDay } from '../today/videos'
import type { Attention } from './attention'
import { NudgeRow } from './GlanceGrid'
import { VideoCard } from './HealthVideos'
import { articleHref } from './library/medline'
import { labKey } from './library/resolve'
import { useLabGlossary } from './labsLogic'
import { track } from '../admin/events'
import { prefersReducedMotion } from '../look/useReducedMotion'
import { DISCOVER_SET, playable, type Video } from './library/videosLogic'
import { metricLabel } from './model'
import { useVisits } from './useVisits'
import { nextVisitLine } from './visitsLogic'
import type { Reading } from './ranges'
import './health.css'

/** Why a clip is here, from data already loaded on Health. match picks the clips that fit it. */
export interface ClipReason { text: string; match: (v: Video) => boolean }

/** The reasons this person's data gives, strongest first: blood pressure readings (clips about blood pressure), a lead lab out of range (blood sugar ties to Diabetes; other labs have no clip, so they add none). Nothing loaded, no reason. */
export function clipReasons(readings: Reading[], attention: Attention | null): ClipReason[] {
  const out: ClipReason[] = []
  if (readings.some((r) => r.test.startsWith('bp_'))) out.push({ text: 'Because you log blood pressure', match: (v) => /blood pressure/i.test(v.title) })
  if (attention && (attention.row.pos === 'above' || attention.row.pos === 'below') && /glucose/.test(attention.reading.test)) out.push({ text: 'Because of a lab result', match: (v) => v.topic === 'Diabetes' })
  return out
}

export const MAX_CLIPS = 6
/** Up to six checked videos (S24 row). Clips that fit a reason come first (up to two per reason), then today's pick and the next on the list; those say what they cover ("Because it covers Move"). */
export function forYouClips(list: Video[], reasons: ClipReason[], now = new Date()): { video: Video; reason: string }[] {
  if (!list.length) return []
  const out: { video: Video; reason: string }[] = []
  for (const r of reasons) {
    for (const v of list.filter((x) => r.match(x)).slice(0, 2)) if (!out.some((o) => o.video === v) && out.length < MAX_CLIPS) out.push({ video: v, reason: r.text })
  }
  const first = videoOfTheDay(now, list)
  for (let i = 0; out.length < Math.min(MAX_CLIPS, list.length) && i < list.length; i++) {
    const v = i === 0 ? first : list[(list.indexOf(first) + i) % list.length]!
    if (!out.some((o) => o.video === v)) out.push({ video: v, reason: `Because it covers ${v.topic}` })
  }
  return out
}

/** One video card (D-180 MediaCard, half): the still from i.ytimg.com (no cookies, no referrer), its length when known and the reason it is here. A tap opens it in place: the Health videos card and player (LiteVideo) take over the row. */
function Clip({ video, reason, testId }: { video: Video; reason: string; testId: string }) {
  const [open, setOpen] = useState(false)
  if (open) return <VideoCard video={video} open onOpen={() => setOpen(true)} testId={testId} />
  return <MediaCard variant="half" id={video.id} title={video.title} channel={video.source} minutes={video.minutes} note={reason} testId={testId} onClick={() => setOpen(true)} />
}

/** "More" scrolls to the Health videos section lower on this screen (id health-videos). */
const toVideos = () => document.getElementById('health-videos')?.scrollIntoView?.({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' })

/** For you, top to bottom: today's videos (stills, two across, four then Show more), "Because of you" tied to the lead result, then the small log row. No data means no log row and no article. */
export function ForYou({ personId, readings, attention, canLog, onAdd }: { personId: string; readings: Reading[]; attention: Attention | null; canLog: boolean; onAdd: (code: 'bp' | 'fasting_glucose') => void }) {
  const clips = useMemo(() => forYouClips(DISCOVER_SET.filter(playable), clipReasons(readings, attention)), [readings, attention])
  const label = attention ? metricLabel(attention.reading.test) : null
  const g = useLabGlossary()
  const key = attention ? labKey(g, attention.reading.test) ?? labKey(g, label ?? '') : null // a lab we describe opens its own note, never the online look-up
  const next = nextVisitLine(useVisits(personId))
  const visit = next?.text.startsWith('Next visit: ') ? next : null // a follow-up due is not a booked visit
  return (
    <Section title="For you" testId="for-you" link={{ onClick: toVideos, label: 'More' }}>
      <div className="fy-stack">
        {clips.length > 0 && <MoreGrid label="Videos for you" testId="foryou-videos">{clips.map((c, i) => <Clip key={c.video.id} video={c.video} reason={c.reason} testId={i ? `foryou-video-${i + 1}` : 'foryou-video'} />)}</MoreGrid>}
        {(label || visit) && (
          <div className="fy-reads">
            {label && (
              <a className="card fy-link press" href={key ? articleHref('t', key.slice(2)) : articleHref('s', label)} data-testid="foryou-because" onClick={() => void track('action', 'card_explainer')}>
                <span className="pt-k">Because of your {label}</span>
                <b>A short, checked explainer</b>
                <span className="sub">Read</span>
              </a>
            )}
            {visit && (
              <a className="card fy-link press" href="#health/visits" data-testid="foryou-visit">
                <span className="pt-k">Because you have a visit coming</span>
                <b>Questions to bring on {visit.text.replace('Next visit: ', '')}</b>
                <span className="sub">From your visit notes</span>
              </a>
            )}
          </div>
        )}
        {readings.length > 0 && <div data-testid="foryou-log"><NudgeRow personId={personId} readings={readings} canLog={canLog} onAdd={onAdd} /></div>}
      </div>
    </Section>
  )
}
