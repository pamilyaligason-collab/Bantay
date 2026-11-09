import { Section } from '../look'
import { usePlace } from '../location/useLocation'
import { cut, manilaTime, PAGASA_HOME, PLACE_NAMES, shownRows, signalLines, tone, usePagasa } from './pagasa'
import './pagasa.css'

export const PAGASA_NONE = 'No PAGASA bulletin read in the last 2 hours. Check PAGASA directly.'
export const PAGASA_AUTH = 'PAGASA is the official word.'

/** S27: points at the PAGASA bulletin and says what it says. Always renders; never says a place is safe. `zone` picks the place names looked for in the signal areas. */
export function PagasaCard({ zone }: { zone?: string }) {
  const d = usePagasa()
  if (d === undefined) return null
  const rows = shownRows(d)
  const names = PLACE_NAMES[zone ?? ''] ?? []
  return (
    <Section title="PAGASA" testId="pagasa-section">
      <div className="card pg" data-testid="pagasa-card" data-tone={tone(rows)}>
        {d?.saved && rows.length > 0 && <span className="pg-chip" role="status">Not updated since {manilaTime(d.readAt)}</span>}
        {rows.length === 0 && <p>{PAGASA_NONE}</p>}
        {rows.map((r) => (
          <div key={r.dedupe_key} className="pg-row">
            <b>{r.title}</b>
            {r.issued_at && <span className="pg-sub">Bulletin {manilaTime(r.issued_at)}</span>}
            {r.kind === 'tropical_cyclone' ? signalLines(r, names).map((l) => <span key={l}>{l}</span>) : r.areas && <span>{cut(r.areas)}</span>}
          </div>
        ))}
        <p className="pg-note">{PAGASA_AUTH}</p>
        <a className="pg-link" href={rows[0]?.source_url ?? PAGASA_HOME} target="_blank" rel="noopener noreferrer">Open the PAGASA bulletin ›</a>
      </div>
    </Section>
  )
}

/** Today's copy: finds the zone itself. */
export default function PagasaToday() {
  return <PagasaCard zone={usePlace()?.zone} />
}
