import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { validPhone } from '../sos/contacts'
import { saveProfile, savePhoto } from '../sync/profile'
import ChipField from './ChipField'
import { ALLERGIES, BLOOD_TYPES, CONDITIONS, UNKNOWN } from './lists'
import MedicineEditor from './MedicineEditor'
import { useOwnAvatar, useProfile } from './useProfile'
import './setup.css'
import './details.css'

const NOT_SURE = { bloodType: "Don't know", allergies: 'Not sure', conditions: 'Not sure' } as const
/** Server arrays/strings <-> chip values: UNKNOWN is the "not sure" chip. */
const chips = (v: string[], unsure: string) => (v[0] === UNKNOWN ? [unsure] : v)
const store = (items: string[], unsure: string) => (items.includes(unsure) ? [UNKNOWN] : items)

const PHOTO_PX = 512
function squareJpeg(f: File): Promise<string> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(f)
    const img = new Image()
    img.onload = () => {
      const side = Math.max(1, Math.min(img.width, img.height))
      const c = document.createElement('canvas')
      c.width = c.height = Math.min(PHOTO_PX, side)
      c.getContext('2d')?.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, c.width, c.height)
      URL.revokeObjectURL(url)
      resolve(c.toDataURL('image/jpeg', 0.85))
    }
    img.src = url
  })
}

/** "My details" (mockup me > Edit): photo, phone, birthday, blood type, allergies, conditions, medicines. Name is changed by an admin only. */
export default function DetailsSheet({ personId, name, onClose }: { personId: string; name: string; onClose: () => void }) {
  const row = useProfile(personId)
  const photo = useOwnAvatar()
  const [phone, setPhone] = useState('')
  const typed = useRef(false)
  const serverPhone = row?.phone ?? ''
  useEffect(() => { if (!typed.current) setPhone(serverPhone) }, [serverPhone]) // follows the row until the member starts typing
  const p = row ?? { bloodType: null, allergies: [], conditions: [], birthdate: null, phone: null }
  const bad = phone.trim() !== '' && !validPhone(phone)
  const savePhone = () => {
    const v = phone.trim()
    if (bad || (v || null) === p.phone) return
    void saveProfile(personId, { phone: v || null })
  }
  return createPortal(
    <div className="sh sh-sheet-wrap" onClick={onClose}>
      <div className="sh-sheet" role="dialog" aria-modal="true" aria-label="My details" onClick={(e) => e.stopPropagation()}>
        <span className="sh-grab" />
        <h2 className="sh-h2">My details</h2>
        <div className="dt-photo">
          <span className="sh-av sh-av-lg">{photo ? <img src={photo} alt="" /> : (name || '?').charAt(0).toUpperCase()}</span>
          <label className="sh-pill sh-ghost sh-small dt-file">
            {photo ? 'Change photo' : 'Add a photo'}
            <input type="file" accept="image/*" aria-label="Photo" onChange={(e) => { const f = e.target.files?.[0]; if (f) void squareJpeg(f).then((d) => savePhoto(personId, d)) }} />
          </label>
        </div>
        <p className="sh-sub dt-note">Your name can be changed by an admin.</p>
        <label className="dt-field">
          <span className="sh-sub">Phone number</span>
          <input type="tel" inputMode="tel" placeholder="0917 123 4567" value={phone} aria-invalid={bad || undefined}
            onChange={(e) => { typed.current = true; setPhone(e.target.value) }} onBlur={savePhone} />
          {bad && <span className="dt-err" role="alert">Use 10 to 13 digits, like 0917 123 4567.</span>}
        </label>
        <label className="dt-field">
          <span className="sh-sub">Birthday</span>
          <input type="date" key={row?.birthdate ?? 'none'} defaultValue={p.birthdate ?? ''} max={new Date().toISOString().slice(0, 10)}
            onChange={(e) => void saveProfile(personId, { birthdate: e.target.value || null })} />
        </label>
        <div className="grp">
          <ChipField label="Blood type" options={[...BLOOD_TYPES, NOT_SURE.bloodType]} allowOther={false} exclusive={[NOT_SURE.bloodType]}
            value={p.bloodType === UNKNOWN ? [NOT_SURE.bloodType] : p.bloodType ? [p.bloodType] : []}
            onChange={(v) => void saveProfile(personId, { bloodType: v.includes(NOT_SURE.bloodType) ? UNKNOWN : v[0] ?? null })} />
          <ChipField label="Allergies" multi options={[...ALLERGIES, NOT_SURE.allergies]} exclusive={['None', NOT_SURE.allergies]}
            value={chips(p.allergies, NOT_SURE.allergies)} onChange={(v) => void saveProfile(personId, { allergies: store(v, NOT_SURE.allergies) })} />
          <ChipField label="Health conditions" multi options={[...CONDITIONS, NOT_SURE.conditions]} exclusive={['None', NOT_SURE.conditions]}
            value={chips(p.conditions, NOT_SURE.conditions)} onChange={(v) => void saveProfile(personId, { conditions: store(v, NOT_SURE.conditions) })} />
        </div>
        <MedicineEditor personId={personId} />
        <button type="button" className="sh-pill sh-primary sh-block" onClick={() => { savePhone(); onClose() }}>Done</button>
      </div>
    </div>,
    document.querySelector('.bt') ?? document.body
  )
}
