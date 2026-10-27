import { liveQuery } from 'dexie'
import { useEffect, useMemo, useState } from 'react'
import { ldb, type Medication } from '../../log/store'
import { Icon } from '../../shell/Icon'
import { SubHeader } from '../../shell/SubHeader'
import { MEDCARDS, type CardKind } from './data'
import { pickMeds } from './pick'

const KINDS: { id: CardKind; label: string }[] = [{ id: 'medicine', label: 'Medicines' }, { id: 'supplement', label: 'Supplements' }, { id: 'herbal', label: 'Herbal' }]
const NONE: Medication[] = []

/** #discover/learn/meds: "Mama's medicines" (cards that match live medicine rows), then every card with a search box and kind filters. */
export default function Meds() {
  const [meds, setMeds] = useState(NONE)
  const [q, setQ] = useState('')
  const [kinds, setKinds] = useState<CardKind[]>([])
  useEffect(() => {
    const s = liveQuery(() => ldb.medications.toArray()).subscribe({ next: setMeds, error: () => undefined })
    return () => s.unsubscribe()
  }, [])
  const mine = useMemo(() => pickMeds(meds), [meds])
  const list = MEDCARDS.filter((c) => (!kinds.length || kinds.includes(c.kind)) && (c.name + ' ' + c.forWhat + ' ' + c.match.join(' ')).toLowerCase().includes(q.trim().toLowerCase()))
  const toggle = (k: CardKind) => setKinds((a) => (a.includes(k) ? a.filter((x) => x !== k) : [...a, k]))
  return (
    <div className="lr">
      <SubHeader title="Medicine wiki" backHref="#discover/learn" backLabel="Back to Learn" />
      <label className="lr-search"><Icon name="search" size={20} /><input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search any medicine or supplement" aria-label="Search medicines" /></label>
      {mine.length > 0 && !q && (
        <>
          <b className="lr-lead">Medicines on your family's lists</b>
          <div className="card lr-list" data-testid="mine">
            {mine.map(({ med, card }) => card
              ? <a key={card.id} className="lr-line" href={'#discover/learn/med/' + card.id}><span className="lr-grow"><b>{med.name}{med.strength ? ' ' + med.strength : ''}</b><span className="sub">{card.forWhat}</span></span><Icon name="chev" /></a>
              : <div key={'n' + med.id + med.name} className="lr-line"><span className="lr-grow"><b>{med.name}{med.strength ? ' ' + med.strength : ''}</b><span className="sub">No card yet. Ask your pharmacist.</span></span></div>)}
          </div>
        </>
      )}
      <b className="lr-lead">All medicines and supplements</b>
      <div className="lr-chips" role="group" aria-label="Filter by kind">
        {KINDS.map((k) => <button key={k.id} type="button" className="chip lr-chip" aria-pressed={kinds.includes(k.id)} onClick={() => toggle(k.id)}>{k.label}</button>)}
      </div>
      <div className="card lr-list" data-testid="all">
        {list.map((c) => (
          <a key={c.id} className="lr-line" href={'#discover/learn/med/' + c.id}>
            <span className="lr-grow"><b>{c.name}</b><span className="sub">{c.kind === 'medicine' ? c.forWhat : (c.kind === 'herbal' ? 'Herbal' : 'Supplement') + ', evidence: ' + c.evidence}</span></span><Icon name="chev" />
          </a>
        ))}
        {!list.length && <p className="sub">Nothing found. Ask your pharmacist.</p>}
      </div>
      <p className="lr-src">Cards are written by Bantay in plain words from DailyMed, openFDA and NIH Office of Dietary Supplements. Not copied from drug monographs. Always check with your doctor or pharmacist.</p>
    </div>
  )
}
