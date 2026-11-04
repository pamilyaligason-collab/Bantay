import { useMemo } from 'react'
import { Icon } from '../shell/Icon'
import { Section } from '../look'
import { videoOfTheDay } from '../today/videos'
import type { Attention } from './attention'
import { NudgeRow } from './GlanceGrid'
import { articleHref } from './library/medline'
import { playable, VIDEOS } from './library/videosLogic'
import { metricLabel } from './model'
import type { Reading } from './ranges'
import './health.css'

/** For you, top to bottom: today's video (a full-width 16:9 card, title under it), "Because of you" tied to the lead result, then the small log row. No data means no log row and no article. */
export function ForYou({ personId, readings, attention, canLog, onAdd }: { personId: string; readings: Reading[]; attention: Attention | null; canLog: boolean; onAdd: (code: 'bp' | 'fasting_glucose') => void }) {
  const clip = useMemo(() => { const list = VIDEOS.filter(playable); return list.length ? videoOfTheDay(new Date(), list) : null }, [])
  const label = attention ? metricLabel(attention.reading.test) : null
  return (
    <Section title="For you" testId="for-you">
      <div className="fy-stack">
        <a className="card fy-video press" href="#discover/watch" data-testid="foryou-video">
          <span className="fy-poster" aria-hidden="true"><Icon name="play" size={40} /></span>
          <span className="pt-k">Video</span>
          <b>{clip ? clip.title : 'Checked videos'}</b>
          <span className="sub">{clip?.minutes != null ? `${clip.minutes} min` : 'Watch'}</span>
        </a>
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
