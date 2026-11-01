import { Carousel } from '../look/Carousel'
import { Section } from '../look/Section'
import { playable, VIDEOS } from '../health/library/videosLogic'
import { LiteVideo } from '../media/LiteVideo'
import { Icon } from '../shell/Icon'
import { useKv } from '../shell/useKv'
import { CALM_VIDEO_ID, MEDIA } from './media'

/** Listen and watch: three outside links and one checked video. Absent unless kv flag.calm.radio is on (default off). */
export default function MediaLinks() {
  const [on] = useKv<boolean>('flag.calm.radio', false)
  if (!on) return null
  const v = VIDEOS.find((x) => x.id === CALM_VIDEO_ID && playable(x))
  return (
    <Section title="Listen and watch" meta="Opens the official site" testId="calm-media">
      <Carousel label="Listen and watch">
        {MEDIA.map((m) => (
          <a key={m.href} className="card press cm-media" href={m.href} target="_blank" rel="noopener noreferrer">
            <span className="cm-media-ic"><Icon name={m.icon} size={22} /></span>
            <span className="cm-k">{m.kind}</span><b>{m.title}</b><span className="cm-sub">{m.sub}</span>
            <span className="cm-sr"> (opens outside)</span>
          </a>
        ))}
      </Carousel>
      {v && <div className="card cm-video"><LiteVideo id={v.id} title={v.title} minutes={v.minutes} /></div>}
    </Section>
  )
}
