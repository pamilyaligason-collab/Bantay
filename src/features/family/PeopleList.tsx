import { useState } from 'react'
import { GroupedList, Row, Section } from '../look'
import FmAvatar from './FmAvatar'
import { faceName, faceStatus, lastCheckInWords } from './FacesRow'
import { useFlagLines } from './reportData'
import { checkInLabel, useCheckInsLoaded, type FamilyPerson } from './roster'
import './v13-family.css'

const SHOWN = 3 // the board shows three, then "All people" (F3 layout)

/** People (board): one row per person with their last check-in and one status word (colour is the Row tint on the avatar ring; the word is always there). There is no place sharing yet, so no map. */
export function PeopleList({ people }: { people: FamilyPerson[] }) {
  const loaded = useCheckInsLoaded()
  const flags = useFlagLines(people)
  const [all, setAll] = useState(false)
  if (!loaded || people.length === 0) return null
  const ordered = [...people].sort((a, b) => Number(checkInLabel(loaded[a.id]).ok && !flags[a.id]) - Number(checkInLabel(loaded[b.id]).ok && !flags[b.id])) // anyone flagged or not checked in leads, so the fold never hides them
  return (
    <Section title="People" testId="people" link={people.length > SHOWN ? { label: all ? 'Fewer' : `All people (${people.length})`, onClick: () => setAll(!all) } : undefined}>
      <GroupedList label="People" testId="people-list">
        {(all ? ordered : ordered.slice(0, SHOWN)).map((p) => {
          const c = checkInLabel(loaded[p.id])
          const s = faceStatus({ known: true, checkedIn: c.ok, flag: flags[p.id] ?? null })
          return <Row key={p.id} testId="people-row" avatar={<FmAvatar name={p.name} photoPath={p.photoPath} thumb={p.thumb} size={36} />} title={p.isMe ? 'You' : faceName(p.name)} sub={lastCheckInWords(loaded[p.id])} value={s.kind === 'look' ? (flags[p.id] ?? s.word) : s.word} href={`#family/people/${p.id}`} />
        })}
      </GroupedList>
      <p className="sub pc-foot">No place sharing yet. For now: who checked in.</p>
    </Section>
  )
}
