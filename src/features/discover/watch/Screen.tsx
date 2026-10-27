import { Icon } from '../../shell/Icon'
import { playable, VIDEOS } from '../../health/library/videosLogic'

const watchUrl = (id: string) => 'https://www.youtube.com/watch?v=' + id

/** Official videos grouped by topic (the Learn-and-Move list in videos.json). Each one opens YouTube outside the app: the link is an ordinary outside link, never a player inside Bantay. */
export default function Watch() {
  const list = VIDEOS.filter(playable)
  const topics = [...new Set(list.map((v) => v.topic))]
  return (
    <div className="dc-list" data-testid="watch">
      {topics.map((t) => (
        <section key={t} className="dc-shelf" aria-label={t}>
          <h2 className="sh-h2 dc-shelf-h">{t}</h2>
          {list.filter((v) => v.topic === t).map((v) => (
            <a key={v.id} className="card press dc-item dc-link" href={watchUrl(v.id)} target="_blank" rel="noopener noreferrer">
              <span className="dc-grow"><b>{v.title}</b><span className="sub">{v.source}</span></span>
              <Icon name="out" />
              <span className="dc-sr">Opens YouTube</span>
            </a>
          ))}
        </section>
      ))}
      <p className="sub dc-quiet">Live TV is coming.</p>
    </div>
  )
}
