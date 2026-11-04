import { EmptyState, JackArt } from '../../look'
import { Icon } from '../../shell/Icon'
import { canSpeak } from './speech'
import { useReadAloud } from './useReadAloud'

/** Discover > Listen: recipes (and medicine cards, once the clinician has signed them) read aloud. One at a time; leaving the page stops the voice. The play button leads each row so nothing sits under Jack at the right edge. */
export default function Listen() {
  const { items, playing, toggle } = useReadAloud()
  if (!canSpeak()) return <EmptyState icon="info" title="Reading aloud is not on this phone" body="Your phone has no voice for it yet. You can still read every recipe in Learn." />
  return (
    <div className="dc-list" data-testid="listen">
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
