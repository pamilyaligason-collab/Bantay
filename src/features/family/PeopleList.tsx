import { GroupedList, Row, Section } from '../look'
import FmAvatar from './FmAvatar'
import { faceName, faceStatus, lastCheckInWords } from './FacesRow'
import { useFlagLines } from './reportData'
import { checkInLabel, useCheckInsLoaded, type FamilyPerson } from './roster'
import './v13-family.css'

/** People (board): one row per person with their last check-in and one status word (colour is the Row tint on the avatar ring; the word is always there). There is no place sharing yet, so no map. */
export function PeopleList({ people }: { people: FamilyPerson[] }) {
  const loaded = useCheckInsLoaded()
  const flags = useFlagLines(people)
  if (!loaded || people.length === 0) return null
  return (
    <Section title="People" testId="people">
      <GroupedList label="People" testId="people-list">
        {people.map((p) => {
          const c = checkInLabel(loaded[p.id])
          const s = faceStatus({ known: true, checkedIn: c.ok, flag: flags[p.id] ?? null })
          return <Row key={p.id} testId="people-row" avatar={<FmAvatar name={p.name} photoPath={p.photoPath} thumb={p.thumb} size={36} />} title={p.isMe ? 'You' : faceName(p.name)} sub={lastCheckInWords(loaded[p.id])} value={s.kind === 'look' ? (flags[p.id] ?? s.word) : s.word} href={`#family/people/${p.id}`} />
        })}
      </GroupedList>
      <p className="sub pc-foot">Where people are shows here once place sharing exists. For now: who checked in.</p>
    </Section>
  )
}
