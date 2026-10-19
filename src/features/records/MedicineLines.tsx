import type { RxItem } from './api'

/** Read-only prescription lines. Used by the record detail and under the Records timeline. */
export function MedicineLines({ items }: { items: RxItem[] }) {
  return (
    <div className="grp rx-meds" data-testid="rx-meds">
      {items.map((i) => (
        <div className="row" key={i.id} style={{ alignItems: 'flex-start' }}>
          <span className="grow">
            <span>{i.drug_raw ?? 'Line that could not be read'}</span>
            <span className="sub">{[i.strength, i.dose, i.frequency, i.duration].filter(Boolean).join(' · ')}</span>
          </span>
        </div>
      ))}
    </div>
  )
}
