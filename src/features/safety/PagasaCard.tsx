import { Section } from '../look'
import { usePlace } from '../location/useLocation'
import { placeRegion } from '../location/region'
import { cut, manilaTime, PAGASA_HOME, shownRows, signalLines, tone, usePagasa, usePlaceNames, type PagasaPlace } from './pagasa'
import './pagasa.css'
import { Icon } from '../shell/Icon'

export const PAGASA_NONE = 'No PAGASA bulletin read in the last 2 hours. Check PAGASA directly.'

/** S27: points at the PAGASA bulletin and says what it says. Always renders; never says a place is safe. `place` picks the names looked for in the signal areas. */
export function PagasaCard({ place }: { place: PagasaPlace | null }) {
  const d = usePagasa()
  const away = placeRegion(place) === 'us' // S30 L8 (D4a): a member in the US keeps the Philippine alerts for the family home, labelled as the Philippines
  const names = usePlaceNames(place)
  if (d === undefined) return null
  const rows = shownRows(d)
  return (
    <Section title={away ? 'Philippines: PAGASA' : 'PAGASA'} testId="pagasa-section">
      <div className="card pg" data-testid="pagasa-card" data-tone={tone(rows)}>
        {d?.saved && rows.length > 0 && <span className="pg-chip" role="status">Not updated since {manilaTime(d.readAt)}</span>}
        {away && <p className="pg-sub">Philippine weather bulletin for your family's home area, not for where you are.</p>}
        {rows.length === 0 && <p>{PAGASA_NONE}</p>}
        {rows.map((r) => (
          <div key={r.dedupe_key} className="pg-row">
            <b>{r.title}</b>
            {r.issued_at && <span className="pg-sub">Bulletin {manilaTime(r.issued_at)}</span>}
            {r.kind === 'tropical_cyclone' ? signalLines(r, names).map((l) => <span key={l}>{l}</span>) : r.areas && <span>{cut(r.areas)}</span>}
          </div>
        ))}
        <a className="pg-link" href={rows[0]?.source_url ?? PAGASA_HOME} target="_blank" rel="noopener noreferrer">Open the PAGASA bulletin<Icon name="chev" size={18} /><span className="pg-vh"> (opens in browser)</span></a>
      </div>
    </Section>
  )
}

/** Today's copy: finds the zone itself. */
export default function PagasaToday() {
  return <PagasaCard place={usePlace()} />
}
