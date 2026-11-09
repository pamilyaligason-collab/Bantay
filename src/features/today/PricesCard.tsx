import { Section } from '../look'
import { commonItems, priceDay, priceText, useDaPrices } from '../garden/daPrices'
import './prices.css'

export const PRICES_NOTE = 'Local prices may differ.'

/** S26 (D-164): four everyday prices from the DA Daily Price Index (Metro Manila wet markets, table da_prices). Hidden until a list is known and when the table is empty.
 *  A saved list (offline) shows with its own date. */
export default function PricesCard() {
  const d = useDaPrices()
  if (!d || !d.rows.length) return null
  const items = commonItems(d.rows)
  if (!items.length) return null
  return (
    <Section title="Market prices" link={{ href: '#garden/prices', label: 'All prices' }} testId="today-prices">
      <div className="card dpc" data-testid="prices-card">
        {d.saved && <span className="dpc-chip" role="status">Saved list</span>}
        <p className="dpc-label">Metro Manila prices (DA), {priceDay(d.date)}</p>
        <div role="list">
          {items.map((i) => (
            <div key={`${i.row.commodity}|${i.row.specification}`} className="dpc-row" role="listitem"><span>{i.label}</span><b>{priceText(i.row)}</b></div>
          ))}
        </div>
        <p className="dpc-note cd-meta">{PRICES_NOTE}</p>
      </div>
    </Section>
  )
}
