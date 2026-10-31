import { useState } from 'react'
import { show, type MedicalId } from '../medid/card'
import { useMedicalId } from '../medid/useMedicalId'
import { useQueue } from '../records/useRecordsServer'
import { Icon } from '../shell/Icon'
import { useActing, useActingPersonId } from '../viewas/viewAs'
import Sheet from './Sheet'
import './family.css'

/** "Mama · 68 · A+": only the parts that are known. Unknown is left out, never 0 (ML-05). */
export function idLine(c: Pick<MedicalId, 'name' | 'age' | 'bloodType'>, fallback = 'Me'): string {
  return [c.name || fallback, c.age !== null ? String(c.age) : null, c.bloodType].filter((x) => x !== null && x !== '').join(' · ')
}

const initial = (n: string) => (n.trim().charAt(0) || '?').toUpperCase()

/** The Family tab's hero (D-97, P-2): the person's Medical ID as a dense card that grows to fit every field. Same reads as `medid/MedicalId.tsx`: name, age, blood type, allergies, conditions, medicines, call.
 *  While acting as someone (L6) it shows that member's card and the edit pencil is off ("Exit to edit"). */
export default function ProfileCard() {
  const personId = useActingPersonId()
  const { acting, name: actingName } = useActing()
  const { card, photo, ready } = useMedicalId(acting ? personId : null)
  const queue = useQueue()
  const papers = personId ? queue.byPerson[personId] ?? 0 : 0
  const [list, setList] = useState<'medicines' | 'conditions' | null>(null)
  const add = (to: string, text: string) => acting ? <span className="mid-none">Not added</span> : <a className="fm2-chip" href={to}>{text}</a>
  const call = card.calls[0]
  const medid = acting && personId ? `#medid/${personId}` : '#medid'
  return (
    <section className="card fm2-id" data-hue="amber" data-testid="profilecard" aria-label={`Medical ID for ${card.name || actingName || 'me'}`} aria-busy={!ready || undefined}>
      <div className="fm2-id-top">
        <span className="fm2-av56" aria-hidden="true">{photo ? <img src={photo} alt="" /> : initial(card.name || actingName)}</span>
        <b className="fm2-id-name">{idLine(card, actingName || 'Me')}</b>
        <button type="button" className="fm2-edit" aria-label="Edit name and photo" disabled={acting} title={acting ? 'Exit to edit' : undefined} onClick={() => { location.hash = 'me' }}><Icon name="photo" size={24} /></button>
      </div>
      {(card.bloodType === null || card.allergies.length > 0 || card.missing.includes('allergies')) && (
        <div className="fm2-chips">
          {card.bloodType === null && add('#me', 'Add blood type')}
          {card.allergies.length > 0
            ? card.allergies.map((a) => <span className="fm2-warnchip" key={a}><Icon name="warn" size={16} />{show([a])}</span>)
            : add('#me', 'Add allergies')}
        </div>
      )}
      <div className="fm2-div" />
      <div className="fm2-strip">
        <div>
          {card.medicines.length > 0
            ? <button type="button" className="fm2-stat" onClick={() => setList('medicines')} aria-label={`Medicines, ${card.medicines.length}. Show the list`}><b>{card.medicines.length}</b><span>Medicines</span></button>
            : <div className="fm2-stat"><b>{add('#health/meds', 'Add')}</b><span>Medicines</span></div>}
        </div>
        <div>
          {card.conditions.length > 0
            ? <button type="button" className="fm2-stat" onClick={() => setList('conditions')} aria-label={`Conditions, ${card.conditions.length}. Show the list`}><b>{card.conditions.length}</b><span>Conditions</span></button>
            : <div className="fm2-stat"><b>{add('#me', 'Add')}</b><span>Conditions</span></div>}
        </div>
        <div>
          {call
            ? <a className="fm2-stat" href={`tel:${call.phone.replace(/[^\d+]/g, '')}`} aria-label={`Call ${call.name}`}><b>{call.name}</b><span>Call</span></a>
            : <div className="fm2-stat"><b>{add('#me', 'Add')}</b><span>Call</span></div>}
        </div>
      </div>
      <a className="btn fm2-doc" href={medid}><Icon name="cross" size={20} />Show to a doctor</a>
      <div className="fm2-two">
        {acting
          ? <button type="button" className="btn2" disabled aria-label="Scan, view only" title="Exit to scan"><Icon name="lock" size={20} />View only</button>
          : <a className="btn2" href="#scan"><Icon name="camera" size={20} />Scan</a>}
        <a className="btn2" href="#family/papers"><Icon name="file" size={20} />Papers{papers > 0 && <span className="fm2-badge" aria-label={`${papers} to check`}>{papers}</span>}</a>
      </div>
      {list && (
        <Sheet title={list === 'medicines' ? 'Medicines' : 'Conditions'} onClose={() => setList(null)}>
          <ul className="fm2-full" aria-label={list === 'medicines' ? 'All medicines' : 'All conditions'}>
            {(list === 'medicines' ? card.medicines : card.conditions).map((m) => <li key={m}>{m}</li>)}
          </ul>
        </Sheet>
      )}
    </section>
  )
}
