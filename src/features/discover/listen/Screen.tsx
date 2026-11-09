import { EmptyState, JackArt } from '../../look'
import { Icon } from '../../shell/Icon'
import { CALM_VIDEOS } from '../../calm/media'
import { PlayCard } from '../../health/HealthVideos'
import { MediaList } from '../../look/media/MediaList'
import { readyShelf } from '../learn/ready'
import { canSpeak } from './speech'
import { useReadAloud } from './useReadAloud'
import Radio from './Radio'
import './radio.css'

/** Discover > Listen: checked videos as media cards (D-180), then recipes (and medicine cards, once the clinician has signed them) read aloud. One at a time; leaving the page stops the voice. The play button leads each row so nothing sits under Jack at the right edge. */
export default function Listen() {
  const { items, playing, toggle } = useReadAloud()
  const radio = <a className="card rd-link" href="#discover/listen/radio" data-testid="listen-radio-link"><Icon name="radio" size={28} /><span className="dc-grow"><span className="rd-link-t">Live radio</span><span className="rd-link-s">Love Radio, Easy Rock, DZRH and more</span></span><Icon name="chev" size={20} /></a>
  const guided = CALM_VIDEOS[0] // the Calm guided video, kept below the listen shelf
  const shelf = readyShelf('listen') // the same checked videos Discover Today's Listen card draws from
  const picks = shelf.length > 0 && (
    <MediaList label="Listen videos" testId="listen-shelf">
      {shelf.map((v, i) => <PlayCard key={v.id} variant={i === 0 ? 'hero' : 'row'} big video={v} />)}
    </MediaList>
  )
  const big = guided && <PlayCard variant="row" big testId="listen-guided" video={{ id: guided.id, title: guided.title, source: guided.channel }} />
  if (/^#?discover\/listen\/radio$/.test(location.hash)) return <Radio />
  if (!canSpeak()) return <div className="dc-list" data-testid="listen">{picks}{big}{radio}<EmptyState icon="info" title="Reading aloud is not on this phone" body="Your phone has no voice for it yet. You can still read every recipe in Learn." /></div>
  return (
    <div className="dc-list" data-testid="listen">
      {picks}
      {big}
      {radio}
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
