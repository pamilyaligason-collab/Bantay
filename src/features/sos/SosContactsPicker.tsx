import { useEffect, useMemo, useState } from 'react'
import './sos.css'
import { loadFamily } from '../auth/family'
import { useKv } from '../shell/useKv'
import { canPickContact, pickContact } from '../setup/contactPicker'
import { RELATIONSHIPS } from '../setup/lists'
import { MAX_SOS, normalizeContacts, validPhone, type SosContact } from './contacts'

const blank = (): SosContact => ({ name: '', phone: '' })

/** The one SOS contacts editor, used by Me and the setup wizard. Reads/writes kv `sos.contacts`, migrating old shapes. */
export default function SosContactsPicker({ excludePersonId, onSaved }: { excludePersonId?: string | null; onSaved?: (c: SosContact[]) => void }) {
  const family = useMemo(() => loadFamily().filter((f) => f.personId !== excludePersonId), [excludePersonId])
  const [raw, setRaw, loaded] = useKv<unknown>('sos.contacts', [])
  const [slots, setSlots] = useState<SosContact[]>(() => Array.from({ length: MAX_SOS }, blank))
  useEffect(() => {
    if (!loaded) return
    const c = normalizeContacts(raw, loadFamily())
    setSlots(Array.from({ length: MAX_SOS }, (_, i) => c[i] ?? blank()))
  }, [loaded]) // eslint-disable-line react-hooks/exhaustive-deps -- seed once from storage; edits flow the other way
  const edit = (i: number, c: SosContact) => {
    const n = slots.map((s, k) => (k === i ? c : s))
    setSlots(n)
    const kept = n.filter((s) => s.name.trim() || s.phone.trim())
    setRaw(kept)
    onSaved?.(kept)
  }
  const native = canPickContact()
  const free = family.filter((f) => !slots.some((s) => s.personId === f.personId))
  const firstEmpty = slots.findIndex((s) => !s.name.trim() && !s.phone.trim())
  const phonebook = async (i: number) => {
    const c = await pickContact()
    if (!c) return
    const s = slots[i]!
    edit(i, s.personId ? { ...s, phone: c.phone } : { name: c.name || s.name, phone: c.phone }) // a family member keeps their Bantay name
  }
  return (
    <div className="sos-picker">
      <p className="sub" style={{ margin: 0 }}>Pick up to {MAX_SOS}. If you press SOS, Bantay opens a text to them with your place. Phone numbers stay on this phone.</p>
      {free.length > 0 && (
        <div className="sos-quick">
          <span className="sub">Family on Bantay. Tap to add.</span>
          <div className="sos-quick-row">
            {free.map((f) => (
              <button key={f.personId} type="button" className="sos-chip" disabled={firstEmpty < 0}
                onClick={() => edit(firstEmpty, { name: f.displayName, phone: '', personId: f.personId })}>{f.displayName}</button>
            ))}
          </div>
        </div>
      )}
      <datalist id="sos-rel">{RELATIONSHIPS.map((r) => <option key={r} value={r} />)}</datalist>
      {slots.map((s, i) => {
        const bad = s.phone.trim() !== '' && !validPhone(s.phone)
        return (
          <fieldset className="sos-slot" key={i}>
            <legend>{`Contact ${i + 1}`}</legend>
            <select aria-label={`Contact ${i + 1} family member`} value={s.personId ?? ''}
              onChange={(e) => { const f = family.find((m) => m.personId === e.target.value); edit(i, f ? { name: f.displayName, phone: s.phone, personId: f.personId } : { name: s.name, phone: s.phone }) }}>
              <option value="">Someone else</option>
              {family.map((f) => <option key={f.personId} value={f.personId}>{f.displayName}</option>)}
            </select>
            <input type="text" list="sos-rel" aria-label={`Contact ${i + 1} name`} placeholder="Name, or pick Son, Daughter..." maxLength={60} value={s.name}
              onChange={(e) => edit(i, { name: e.target.value, phone: s.phone })} />
            <input type="tel" inputMode="tel" aria-label={`Contact ${i + 1} phone number`} placeholder="0917 123 4567" value={s.phone}
              aria-invalid={bad || undefined} onChange={(e) => edit(i, { ...s, phone: e.target.value })} />
            {native && <button type="button" className="sos-pick" onClick={() => void phonebook(i)}>Pick from phonebook</button>}
            {bad && <span className="sos-err" role="alert">Use 10 to 13 digits, like 0917 123 4567.</span>}
          </fieldset>
        )
      })}
    </div>
  )
}
