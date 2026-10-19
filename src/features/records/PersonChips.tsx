import type { Person } from './store'
import { firstName } from './ConfirmSheet'
import './records.css'

/** Who's records: "Me" first, then family first names, each with how many results wait to be checked. */
export function PersonChips({ people, ownId, personId, drafts, onPick }: {
  people: Person[]; ownId: string; personId: string; drafts: Record<string, number>; onPick(id: string): void
}) {
  if (people.length < 2) return null
  return (
    <div className="chips" role="group" aria-label="Whose records">
      {people.map((p) => {
        const n = drafts[p.id] ?? 0
        const name = p.id === ownId ? 'Me' : firstName(p.name)
        return (
          <button key={p.id} type="button" className="pchip" aria-pressed={p.id === personId} aria-label={n > 0 ? `${name}, ${n} to check` : undefined} onClick={() => onPick(p.id)}>
            {name}
            {n > 0 && <span className="pchip-n" aria-hidden="true">{n}</span>}
          </button>
        )
      })}
    </div>
  )
}
