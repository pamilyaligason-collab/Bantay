import { MoreGrid } from '../look/MoreGrid'
import { Section } from '../look/Section'
import { LiteVideo } from '../media/LiteVideo'
import { useOnline } from '../media/useOnline'
import { Icon } from '../shell/Icon'
import { CALM_VIDEOS, MEDIA, RADIO } from './media'
import { useRadio } from './useRadio'

/** Listen and watch, one swipe row as on the board: radio that plays here, the podcast link, and checked videos that play after a tap (LiteVideo). Nothing loads before a tap except the video posters (i.ytimg.com). The audio stops with this section (useRadio). */
export default function MediaLinks() {
  const online = useOnline()
  const radio = useRadio()
  return (
    <Section title="Listen and watch" testId="calm-media">
      <audio ref={radio.audio} preload="none" data-testid="calm-audio" {...radio.events} />
      <MoreGrid label="Listen and watch" testId="calm-row">
        {RADIO.map((s) => {
          const state = radio.now?.id === s.id ? radio.now.state : null
          const active = state === 'loading' || state === 'playing'
          return (
            <div key={s.id} className="card cm-media" data-testid={`calm-radio-${s.id}`} data-state={state ?? 'idle'}>
              <span className="cm-media-ic"><Icon name="radio" size={34} />{state === 'playing' && <span className="cm-eq" aria-hidden="true"><i /><i /><i /><i /></span>}</span>
              <span className="cm-k">Radio</span><b>{s.title}</b>
              <span className="cm-sub" aria-live="polite">{state === 'loading' ? 'Loading' : state === 'playing' ? 'Playing' : state === 'error' ? 'The radio did not start.' : s.sub}</span>
              <div className="cm-acts">
                <button type="button" className="btn cm-play" disabled={!online && !active} aria-busy={state === 'loading'} aria-label={`${active ? 'Stop' : 'Play'} ${s.title}`} onClick={() => radio.toggle(s)}>{active ? 'Stop' : 'Play'}</button>
                <a className="cm-out" href={s.site} target="_blank" rel="noopener noreferrer">Station site<span className="cm-sr"> of {s.title} (opens outside)</span></a>
              </div>
            </div>
          )
        })}
        {MEDIA.map((m) => (
          <a key={m.href} className="card press cm-media" href={m.href} target="_blank" rel="noopener noreferrer">
            <span className="cm-media-ic"><Icon name={m.icon} size={34} /></span>
            <span className="cm-k">{m.kind}</span><b>{m.title}</b><span className="cm-sub">{m.sub}</span>
            <span className="cm-sr"> (opens outside)</span>
          </a>
        ))}
        {CALM_VIDEOS.map((v) => (
          <div key={v.id} className="card cm-video"><LiteVideo id={v.id} title={v.title} />
            <span className="cm-sub cm-chan">Channel: {v.channel}</span></div>
        ))}
      </MoreGrid>
      <p className="cm-sub" role="status">{online ? 'Radio plays here after a tap. Radio stops when you leave Calm. Videos use YouTube privacy mode. Links open their sites.' : 'You are offline. These open when you are back online.'}</p>
    </Section>
  )
}
