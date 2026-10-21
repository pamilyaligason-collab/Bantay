import { useEffect } from 'react'
import data from './firstaid.json'
import { Icon, type IconName } from '../shell/Icon'
import { SubHeader } from '../shell/SubHeader'
import { LiteVideo } from '../media/LiteVideo'
import './safety.css'

export interface FirstAidTopic {
  id: string; title: string; tl: string; urgency: 'high' | 'normal'
  steps: string[]; call911: string[]
  video: { id: string; title: string; channel: string } | null
  sources: { label: string; url: string }[]
}
export const TOPICS = data.topics as FirstAidTopic[]
export const FOOTER = 'General first-aid guidance, not a diagnosis.'
const PREFIX = '#safety/firstaid/'
/** '#safety/firstaid/choking' -> the topic; unknown ids -> null (the hub). */
export const topicOf = (hash: string): FirstAidTopic | null => (hash.startsWith(PREFIX) ? TOPICS.find((t) => PREFIX + t.id === hash) ?? null : null)

const ICON: Record<string, IconName> = { stroke: 'brain', 'dengue-warning-signs': 'therm', cpr: 'heart', choking: 'lungs', bleeding: 'drop', 'heat-stroke': 'sun', seizure: 'bolt', drowning: 'rain', 'heart-attack': 'heart' }

/** Act early: the grid is sized by urgency, the high-urgency topics take the full row. */
export function ActEarly() {
  return (
    <section aria-labelledby="sf-act-h" className="sf-act-sec">
      <h2 id="sf-act-h" className="hd">Act early</h2>
      <p className="sf-act-note"><b>Call 911 first</b> if someone cannot breathe, cannot speak, or will not wake up.</p>
      <nav className="sf-tiles" aria-label="Act early">
        {TOPICS.map((t) => (
          <a key={t.id} href={PREFIX + t.id} className={`sf-tile${t.urgency === 'high' ? ' sf-wide' : ''}`}>
            <Icon name={ICON[t.id] ?? 'aid'} tone="safety" boxed size={24} />
            <span className="sf-tile-t">{t.title}</span>
            <span className="sf-tile-s">{t.tl}</span>
          </a>
        ))}
      </nav>
    </section>
  )
}

export function FirstAidPage({ topic }: { topic: FirstAidTopic }) {
  useEffect(() => { document.querySelector('main.scroll')?.scrollTo?.(0, 0) }, [topic.id])
  return (
    <>
      <SubHeader title={topic.title} backHref="#safety" backLabel="Back to Safety" className="sf-hdr sf-subhdr" />
      <div className="sf fa">
        <a href="tel:911" className="btn fa-call">Call 911</a>
        <ol className="fa-steps" aria-label="Steps">
          {topic.steps.map((s, i) => (
            <li key={i}><span className="fa-n" aria-hidden="true">{i + 1}</span><span>{s}</span></li>
          ))}
        </ol>
        <section className="fa-911" aria-labelledby="fa-911-h">
          <h2 id="fa-911-h"><Icon name="warn" size={22} />Call 911 when</h2>
          <ul>{topic.call911.map((c) => <li key={c}>{c}</li>)}</ul>
        </section>
        {topic.video && <LiteVideo id={topic.video.id} title={`${topic.video.title} (${topic.video.channel})`} />}
        <section aria-labelledby="fa-more-h">
          <h2 id="fa-more-h" className="hd">Learn more</h2>
          <ul className="fa-links">
            {topic.sources.map((s) => (
              <li key={s.url}><a href={s.url} target="_blank" rel="noopener noreferrer"><Icon name="out" size={18} />{s.label}<span className="lv-sr"> (opens in new tab)</span></a></li>
            ))}
          </ul>
        </section>
        <p className="sub fa-foot">{FOOTER}</p>
      </div>
    </>
  )
}
