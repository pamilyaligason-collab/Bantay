import { PickCard, SeasonRow } from './today/Cards'
import { Tile, type Hue } from '../look'
import type { IconName } from '../shell/Icon'
import { DISCOVER_SUBS, type DiscoverSub } from './index'
import { playable, VIDEOS } from '../health/library/videosLogic'
import './discover.css'

// Icon names are the shell set; book / ear / game / news icons are an L9 request (see needs).
const LOOK: Record<DiscoverSub, { hue: Hue; icon: IconName; value: () => string }> = {
  learn: { hue: 'amber', icon: 'file', value: () => 'Medicines, recipes, topics' },
  watch: { hue: 'terra', icon: 'play', value: () => `${VIDEOS.filter(playable).length} checked videos` },
  listen: { hue: 'green', icon: 'mic', value: () => 'Articles read out loud' },
  play: { hue: 'lilac', icon: 'smile', value: () => 'Memory, word games' },
  news: { hue: 'blue', icon: 'info', value: () => 'Good news and fun facts' }
}

/** #discover: the pick hero, the season row, then five tiles (Learn, Watch, Listen, Play, News). Whole cards are the links. */
export default function Overview() {
  return (
    <>
      <div className="hdr"><h1>Discover</h1></div>
      <PickCard />
      <SeasonRow />
      <div className="dc-tiles" data-testid="discover-tiles">
        {DISCOVER_SUBS.map((s) => {
          const l = LOOK[s.id]
          return <Tile key={s.id} hue={l.hue} icon={l.icon} label={s.label} value={l.value()} href={'#discover/' + s.id} testId={'tile-' + s.id} />
        })}
      </div>
    </>
  )
}
