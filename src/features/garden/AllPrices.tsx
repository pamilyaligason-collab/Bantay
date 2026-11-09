import { SubHeader } from '../shell/SubHeader'
import { groupRows, priceDay, priceText, useDaPrices } from './daPrices'
import './garden.css'

/** #garden/prices: every priced item of the newest DA day, grouped. A saved list (offline) shows with its date. */
export function AllPrices() {
  const d = useDaPrices()
  const head = <SubHeader title="All prices" backHref="#today" backLabel="Today" />
  if (d === undefined) return <section className="gpl-page" aria-busy="true">{head}</section>
  if (!d || !d.rows.length) return <section className="gpl-page">{head}<p className="gpl-sub">No prices are saved yet. They appear when the phone is online.</p></section>
  return (
    <section className="gpl-page" data-testid="prices-page">
      {head}
      <p className="gpl-sub">Metro Manila prices (DA), {priceDay(d.date)}. Local prices may differ.{d.saved ? ' Saved list, the phone is offline.' : ''}</p>
      {groupRows(d.rows).map((g) => (
        <div key={g.group} className="card gpl-group">
          <h2>{g.group}</h2>
          <div role="list">
            {g.rows.map((r) => (
              <div key={`${r.commodity}|${r.specification}`} className="gpl-pr" role="listitem">
                <span>{r.commodity}{r.specification && <small>{r.specification}</small>}</span>
                <b>{priceText(r)}</b>
              </div>
            ))}
          </div>
        </div>
      ))}
    </section>
  )
}
