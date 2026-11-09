import { RadioSections } from '../discover/listen/Radio'
import { MoreGrid } from '../look/MoreGrid'
import { Section } from '../look/Section'
import { LiteVideo } from '../media/LiteVideo'
import { useOnline } from '../media/useOnline'
import { CALM_VIDEOS } from './media'

/** Listen and watch: Philippine radio by section (the one player of Discover > Listen, D-178), then checked videos that play after a tap (LiteVideo). Nothing loads before a tap except the video posters (i.ytimg.com). The radio stops with this section. */
export default function MediaLinks() {
  const online = useOnline()
  return (
    <Section title="Listen and watch" testId="calm-media">
      <RadioSections headingLevel={3} />
      <MoreGrid label="Calm videos" testId="calm-row">
        {CALM_VIDEOS.map((v) => (
          <div key={v.id} className="card cm-video"><LiteVideo id={v.id} title={v.title} />
            <span className="cm-sub cm-chan">Channel: {v.channel}</span></div>
        ))}
      </MoreGrid>
      <p className="cm-sub" role="status">{online ? 'Radio plays here after a tap. Radio stops when you leave Calm. Videos use YouTube privacy mode. Links open their sites.' : 'You are offline. These open when you are back online.'}</p>
    </Section>
  )
}
