import { useMemo } from 'react'
import { Carousel, Section } from '../look'
import { videoOfTheDay } from '../today/videos'
import type { Attention } from './attention'
import { NudgeRow } from './GlanceGrid'
import { articleHref } from './library/medline'
import { playable, VIDEOS } from './library/videosLogic'
import { metricLabel } from './model'
import type { Reading } from './ranges'
import './health.css'

/** For you: a swipe row of the week's nudge, today's video and an article tied to the lead result. No data means no nudge and no article. */
export function ForYou({ personId, readings, attention, canLog, onAdd }: { personId: string; readings: Reading[]; attention: Attention | null; canLog: boolean; onAdd: (code: 'bp' | 'fasting_glucose') => void }) {
  const clip = useMemo(() => { const list = VIDEOS.filter(playable); return list.length ? videoOfTheDay(new Date(), list) : null }, [])
  const label = attention ? metricLabel(attention.reading.test) : null
  return (
    <Section title="For you">
      <Carousel label="For you" testId="for-you">
        {readings.length > 0 && <div className="fy-card"><NudgeRow personId={personId} readings={readings} canLog={canLog} onAdd={onAdd} /></div>}
        <a className="card fy-card fy-link press" href="#discover/watch" data-testid="glance-video">
          <span className="pt-k">Video</span>
          <b>{clip ? clip.title : 'Checked videos'}</b>
          <span className="sub">{clip?.minutes != null ? `${clip.minutes} min` : 'Watch'}</span>
        </a>
        {label && (
          <a className="card fy-card fy-link press" href={articleHref('s', label)} data-testid="for-you-article">
            <span className="pt-k">Read</span>
            <b>Because of your {label}</b>
            <span className="sub">A short, checked explainer</span>
          </a>
        )}
      </Carousel>
    </Section>
  )
}
