import { RadioSections } from '../discover/listen/Radio'
import { PlayCard } from '../health/HealthVideos'
import { MediaList } from '../look/media/MediaList'
import { Section } from '../look/Section'
import { useOnline } from '../media/useOnline'
import { CALM_VIDEOS } from './media'

/** Listen and watch: Philippine radio by section (the one player of Discover > Listen, D-178), then checked videos as media cards (D-180) that play in place after a tap (LiteVideo). Nothing loads before a tap except the video stills (i.ytimg.com). The radio stops with this section. */
export default function MediaLinks() {
  const online = useOnline()
  return (
    <Section title="Listen and watch" testId="calm-media">
      <RadioSections headingLevel={3} />
      <MediaList label="Calm videos" testId="calm-row">
        {CALM_VIDEOS.map((v) => <PlayCard key={v.id} video={{ id: v.id, title: v.title, source: v.channel }} />)}
      </MediaList>
      <p className="cm-sub" role="status">{online ? 'Radio plays here after a tap. Radio stops when you leave Calm. Videos use YouTube privacy mode. Links open their sites.' : 'You are offline. These open when you are back online.'}</p>
    </Section>
  )
}
