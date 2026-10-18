import { useEffect, useMemo, useState } from 'react'
import './sos.css'
import { loadFamily } from '../auth/family'
import { useKv } from '../shell/useKv'
import { MAX_SOS, normalizeContacts, validPhone, type SosContact } from './contacts'

const blank = (): SosContact => ({ name: '', phone: '' })

/** The one SOS contacts editor, used by Me and the setup wizard. Reads/writes kv `sos.contacts`, migrating old shapes. */
export default function SosContactsPicker({ excludePersonId }: { excludePersonId?: string | null }) {
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
    setRaw(n.filter((s) => s.name.trim() || s.phone.trim()))
  }
  return (
    <div className="sos-picker">
      <p className="sub" style={{ margin: 0 }}>Pick up to {MAX_SOS}. If you press SOS, Bantay opens a text to them with your place. Phone numbers stay on this phone.</p>
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
            <input type="text" aria-label={`Contact ${i + 1} name`} placeholder="Name" maxLength={60} value={s.name}
              onChange={(e) => edit(i, { name: e.target.value, phone: s.phone })} />
            <input type="tel" inputMode="tel" aria-label={`Contact ${i + 1} phone number`} placeholder="0917 123 4567" value={s.phone}
              aria-invalid={bad || undefined} onChange={(e) => edit(i, { ...s, phone: e.target.value })} />
            {bad && <span className="sos-err" role="alert">Use 10 to 13 digits, like 0917 123 4567.</span>}
          </fieldset>
        )
      })}
    </div>
  )
}
