import { EmptyState, JackArt } from '../../look'
import { Icon } from '../../shell/Icon'
import { CALM_VIDEOS } from '../../calm/media'
import { LiteVideo } from '../../media/LiteVideo'
import { readyShelf } from '../learn/ready'
import { canSpeak } from './speech'
import { useReadAloud } from './useReadAloud'

/** Discover > Listen: recipes (and medicine cards, once the clinician has signed them) read aloud. One at a time; leaving the page stops the voice. The play button leads each row so nothing sits under Jack at the right edge. */
export default function Listen() {
  const { items, playing, toggle } = useReadAloud()
  const guided = CALM_VIDEOS[0] // the Calm guided video, kept below the listen shelf
  const shelf = readyShelf('listen') // the same checked videos Discover Today's Listen card draws from
  const picks = shelf.length > 0 && (
    <div className="dc-list" data-testid="listen-shelf">
      {shelf.map((v) => (
        <div key={v.id} className="card dc-bigrow">
          <b className="dc-bigrow-t">{v.title}</b>
          <LiteVideo id={v.id} title={v.title} />
          <span className="dc-bigrow-s">{v.source} · large controls</span>
        </div>
      ))}
    </div>
  )
  const big = guided && (
    <div className="card dc-bigrow" data-testid="listen-guided">
      <b className="dc-bigrow-t">{guided.title}</b>
      <LiteVideo id={guided.id} title={guided.title} />
      <span className="dc-bigrow-s">Guided · {guided.channel} · large controls</span>
    </div>
  )
  if (!canSpeak()) return <div className="dc-list" data-testid="listen">{picks}{big}<EmptyState icon="info" title="Reading aloud is not on this phone" body="Your phone has no voice for it yet. You can still read every recipe in Learn." /></div>
  return (
    <div className="dc-list" data-testid="listen">
      {picks}
      {big}
      <div className="s14j-art"><JackArt name="listening" size={96} /></div>
      <p className="sub dc-lead">Tap play and your phone reads it out loud.</p>
      {items.map((it) => {
        const on = playing === it.id
        return (
          <div key={it.id} className={`card dc-item${on ? ' is-on' : ''}`}>
            <button type="button" className="sh-iconbtn dc-play" aria-pressed={on} aria-label={`${on ? 'Stop' : 'Play'} ${it.title}`} onClick={() => void toggle(it.id)}>
              <Icon name={on ? 'pause' : 'play'} />
            </button>
            <span className="dc-grow"><b>{it.title}</b><span className="sub">{it.sub}</span></span>
          </div>
        )
      })}
    </div>
  )
}
