import { properName } from './medName'
import { useHealthPerson } from './useHealthPerson'

/** Whose page this is: "Me" or the proper name. The person is chosen on the Health root (H6), so the sub-screens show no chips. Nothing until we know who. */
export function WhoLine() {
  const { ready, people, ownId, personId } = useHealthPerson()
  if (!ready || !personId) return null
  const name = personId === ownId ? 'Me' : properName(people.find((p) => p.id === personId)?.name ?? '')
  return name ? <p className="eyebrow wl" data-testid="who-line">{name}</p> : null
}
