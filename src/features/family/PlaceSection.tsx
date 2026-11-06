import { GroupedList, Row, Section } from '../look'
import FmAvatar from './FmAvatar'
import { faceName } from './FacesRow'
import PlaceMap from './PlaceMap'
import { placeSub } from './placeAge'
import { usePlaces, type Place } from './placeApi'
import { useFamilyPeople } from './roster'
import './place.css'

export const PLACE_FOOT = 'Only people who share appear. Latest point only, no history. Pins older than 6 hours turn grey.'

/** Name lookup for a place: "You" for this phone's owner, the short name for the rest. */
function useNames() {
  const { people } = useFamilyPeople()
  const full = (id: string) => people.find((x) => x.id === id)?.name ?? 'Family member'
  return { people, full, nameOf: (id: string) => { const p = people.find((x) => x.id === id); return p ? (p.isMe ? 'You' : faceName(p.name)) : 'Family member' } }
}

/** Family > "Where everyone is" (board S22FamilyMap): the map and a link to the full view. `places` comes from usePlaces. Shows nothing until the family's places are read, and nothing when nobody shares (unknown is not "nobody"). */
export function WhereCard({ places }: { places: Place[] | null | undefined }) {
  const { full } = useNames()
  if (!places?.length) return null
  return (
    <Section title="Where everyone is" link={{ href: '#family/map', label: 'Full map' }} testId="where">
      <PlaceMap places={places} nameOf={full} height={240} testId="where-map" />
      <p className="pl-foot">{PLACE_FOOT}</p>
    </Section>
  )
}

/** #family/map: the full map, then one row per person who shares (place age, accuracy when coarse, battery in words). */
export function PlaceScreen() {
  const places = usePlaces()
  const { people, nameOf, full } = useNames()
  const now = Date.now()
  const sorted = places ? [...places].sort((a, b) => b.fixedAt - a.fixedAt) : []
  const row = (p: Place) => {
    const who = people.find((x) => x.id === p.personId)
    return <Row key={p.personId} testId="place-row" avatar={<FmAvatar name={who?.name ?? 'Family member'} photoPath={who?.photoPath} thumb={who?.thumb} size={36} />} title={nameOf(p.personId)} sub={placeSub(p, now)} href={`#family/people/${p.personId}`} />
  }
  return (
    <>
      {places === undefined ? <p className="pl-foot" role="status">Loading the map…</p>
        : places === null ? <p className="pl-foot" role="status">Could not load the map. Try again when you are online.</p>
        : places.length === 0 ? <p className="pl-foot" role="status">Nobody is sharing a place yet.</p>
        : (
          <>
            <PlaceMap places={places} nameOf={full} height={380} now={now} />
            <GroupedList label="Where everyone is" testId="place-list">{sorted.map(row)}</GroupedList>
          </>
        )}
      <p className="pl-foot">{PLACE_FOOT}</p>
    </>
  )
}
