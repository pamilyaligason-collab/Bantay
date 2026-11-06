import { useEffect, useState } from 'react'
import { loadFamily } from '../auth/family'
import FmAvatar from '../family/FmAvatar'
import { sendAttachment } from '../family/messagesApi'
import { mmss, VOICE_MAX_S } from '../family/messagesLogic'
import { dial, useFamilyPeople, type FamilyPerson } from '../family/roster'
import { useVoiceNote } from '../family/useVoiceNote'
import { leaveSheet, Sheet } from '../look/Sheet'
import { useKv } from '../shell/useKv'
import { SOS_CONTACTS_KEY } from './active'
import { callFirstContact } from './call'
import Call911 from './Call911'
import { normalizeContacts } from './contacts'
import { smsNumber, usableNumber } from './sms'
import './sos.css'

const NONE: unknown[] = []
const first = (n: string) => n.trim().split(/\s+/)[0] || n

/** The number to use for one person: their profile phone (roster.dial), then the phone saved for them in the SOS contacts. Null = none. */
export function numberFor(p: Pick<FamilyPerson, 'id' | 'phone'>, saved: { personId?: string; phone: string }[]): string | null {
  const own = dial(p.phone)
  if (own && usableNumber(own)) return own
  const s = saved.find((c) => c.personId === p.id && usableNumber(c.phone))
  return s ? smsNumber(s.phone) : null
}

/** SOS short tap (D-137): the family, one row each. A tap on a person offers Call, Text or a Voice note. The 3-second hold is not touched by this sheet. */
export default function SosFamilySheet({ onClose }: { onClose: () => void }) {
  const { people } = useFamilyPeople()
  const [raw] = useKv<unknown[]>(SOS_CONTACTS_KEY, NONE)
  const saved = normalizeContacts(raw, loadFamily())
  const [open, setOpen] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [unsent, setUnsent] = useState<'' | 'offline' | 'failed'>('') // the recorded note stays in `voice` until it is sent or discarded
  const [askClose, setAskClose] = useState(false)
  const { rec, voice, setVoice, canRecord, startRec, stop, cancel } = useVoiceNote(setNote)
  const others = people.filter((p) => !p.isMe)
  useEffect(() => { if (!voice || rec) setAskClose(false) }, [voice, rec]) // no held note, or a new recording: a shown confirm is stale

  const pick = (id: string) => { if (rec) return; setVoice(null); setUnsent(''); setNote(''); setOpen(open === id ? null : id) }
  const sendVoice = async (p: FamilyPerson) => {
    if (!voice) return
    if (typeof navigator !== 'undefined' && !navigator.onLine) { setUnsent('offline'); return } // shortcut: no blob outbox, the note waits in this sheet's state and is lost if the sheet closes (asked first)
    setBusy(true); setNote(''); setUnsent('')
    const r = await sendAttachment(voice.blob, { kind: 'voice', ext: voice.ext, mime: voice.mime, durationS: voice.secs, body: `For ${first(p.name)}` })
    setBusy(false)
    if (r.ok) { setVoice(null); setNote(`Sent. ${first(p.name)} will find it in Family messages.`) } else setUnsent(r.error === 'offline' ? 'offline' : 'failed')
  }
  const discard = () => { setVoice(null); setUnsent('') }
  const guard = () => { if (voice && !askClose) { setAskClose(true); return true } return false }

  return (
    <Sheet title="Contact family" onClose={onClose} guard={guard} testId="sos-family-sheet">
      <div className="sosf">
        {others.length === 0 && <p className="sub">No family members are listed on this phone yet.</p>}
        {others.map((p) => {
          const num = numberFor(p, saved)
          const f = first(p.name)
          const isOpen = open === p.id
          return (
            <div key={p.id} className="sosf-person">
              <button type="button" className="sosf-row" aria-expanded={isOpen} onClick={() => pick(p.id)}>
                <FmAvatar name={p.name} photoPath={p.photoPath} thumb={p.thumb} size={48} />
                <span className="grow"><b>{p.name}</b><span className="sub">{num ? (dial(p.phone) ? p.phone : num) : 'No number saved: add one in Me > Family'}</span></span>
              </button>
              {isOpen && (
                <div className="sosf-acts">
                  {num && <a className="sosf-act call" href={`tel:${num}`} aria-label={`Call ${f}`} onClick={(e) => { e.preventDefault(); void callFirstContact([{ name: p.name, phone: num }]) }}>Call</a>}
                  {num && <a className="sosf-act text" href={`sms:${smsNumber(num)}?body=${encodeURIComponent(`Hi ${f}, please call me. Sent from Bantay.`)}`} aria-label={`Text ${f}`}>Text</a>}
                  {canRecord && <button type="button" className="sosf-act voice" aria-label={`Voice note for ${f}`} disabled={!!rec || busy} onClick={() => void startRec()}>Voice</button>}
                </div>
              )}
              {isOpen && rec && (
                <div className="sosf-rec" role="status">Recording {mmss(rec.secs)} of {mmss(VOICE_MAX_S)}
                  <button type="button" className="pill" onClick={stop}>Stop</button>
                  <button type="button" className="pill" onClick={cancel}>Cancel</button></div>
              )}
              {isOpen && voice && !rec && (
                <div className="sosf-rec">
                  <audio controls src={voice.url} aria-label="Your voice note" />
                  {unsent && <p className="sub sosf-unsent" role="alert">{unsent === 'offline' ? 'Not sent yet: no signal' : 'Not sent yet: it did not send'}</p>}
                  <button type="button" className="pill primary sosf-btn" disabled={busy} onClick={() => void sendVoice(p)}>{unsent ? 'Send again' : `Send to ${f}`}</button>
                  <button type="button" className="pill sosf-btn" onClick={discard}>Discard</button>
                </div>
              )}
            </div>
          )
        })}
        {askClose && voice && (
          <div className="sosf-confirm" role="alertdialog" aria-label="Close and lose the voice note?">
            <p>Your voice note is not sent. Close and lose it?</p>
            <div>
              <button type="button" className="pill sosf-btn" onClick={() => setAskClose(false)}>Keep it</button>
              <button type="button" className="pill sosf-btn" onClick={() => { setVoice(null); setAskClose(false); leaveSheet(onClose) }}>Close anyway</button>
            </div>
          </div>
        )}
        {note && <p className="sub sosf-note" role="status">{note}</p>}
        <Call911 />
      </div>
    </Sheet>
  )
}
