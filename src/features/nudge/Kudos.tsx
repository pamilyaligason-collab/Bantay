import { useRef, useState } from 'react'
import type { FamilyPerson } from '../family/roster'
import { KUDOS_VOICE_MAX_S, sendAttachment, sendKudosHeart, type Res } from '../family/messagesApi'
import { pickRecorderMime } from '../family/messagesLogic'

const first = (n: string) => n.trim().split(/\s+/)[0] || 'them'
const WORDS = { ok: 'Sent. They will see it in Bantay.', offline: 'You need signal to send this.', not_set_up: 'Family messages are not set up yet.', unavailable: 'Sign in to send hearts.', failed: 'Could not send. Try again.' }
const say = (r: Res<null>) => (r.ok ? WORDS.ok : WORDS[r.error])

/** Hearts and short voice notes (15 seconds at most) for anyone in the family. Online only, and about one person: the server tells that person, with no name in the alert. */
export function Kudos({ people }: { people: FamilyPerson[] }) {
  const others = people.filter((p) => !p.isMe)
  const [note, setNote] = useState('')
  const [rec, setRec] = useState<{ id: string; secs: number } | null>(null)
  const stop = useRef<(() => void) | null>(null)
  const canRecord = typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia

  const heart = async (p: FamilyPerson) => setNote(say(await sendKudosHeart(p.id)))
  const record = async (p: FamilyPerson) => {
    if (rec) { stop.current?.(); return }
    const pick = canRecord ? pickRecorderMime((m) => MediaRecorder.isTypeSupported(m)) : null
    if (!pick) { setNote('Voice notes do not work on this phone. Send a heart instead.'); return }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const r = new MediaRecorder(stream, { mimeType: pick.mime })
      const chunks: Blob[] = []
      const t0 = Date.now()
      const tick = setInterval(() => { const s = (Date.now() - t0) / 1000; setRec({ id: p.id, secs: s }); if (s >= KUDOS_VOICE_MAX_S) r.stop() }, 250)
      r.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data) }
      r.onstop = async () => {
        clearInterval(tick); stream.getTracks().forEach((t) => t.stop()); setRec(null); stop.current = null
        if (!chunks.length) return
        const blob = new Blob(chunks, { type: pick.mime.split(';')[0] })
        setNote(say(await sendAttachment(blob, { kind: 'kudos', aboutPerson: p.id, ext: pick.ext, mime: blob.type || pick.mime.split(';')[0]!, durationS: Math.min(KUDOS_VOICE_MAX_S, Math.max(1, (Date.now() - t0) / 1000)) })))
      }
      stop.current = () => { if (r.state !== 'inactive') r.stop() }
      r.start()
      setRec({ id: p.id, secs: 0 })
    } catch { setNote('Bantay cannot use the microphone. Allow it in your phone settings, or send a heart.') }
  }
  return (
    <section className="sh-card nu-card" data-testid="nudge-kudos" aria-labelledby="nu-kudos-h">
      <h2 className="sh-h2" id="nu-kudos-h">Send kudos</h2>
      <p className="sh-sub">A heart or a voice note of up to {KUDOS_VOICE_MAX_S} seconds. It cheers someone on; it never shows a reading.</p>
      {others.length === 0 ? <p className="sh-sub">No family on this phone yet.</p> : (
        <ul className="sh-list nu-people">
          {others.map((p) => (
            <li key={p.id} data-person={p.id}>
              <span className="sh-grow">{first(p.name)}</span>
              <button type="button" className="sh-pill sh-ghost sh-small" onClick={() => void heart(p)} aria-label={`Send a heart to ${first(p.name)}`}><span aria-hidden="true">{'♥'}</span> Heart</button>
              {canRecord && <button type="button" className="sh-pill sh-ghost sh-small" onClick={() => void record(p)} aria-label={rec?.id === p.id ? `Stop and send to ${first(p.name)}` : `Record a voice note for ${first(p.name)}`}>{rec?.id === p.id ? `Send ${Math.ceil(rec.secs)}s` : 'Voice'}</button>}
            </li>
          ))}
        </ul>
      )}
      {note && <p className="sh-sub" role="status" data-testid="kudos-said">{note}</p>}
    </section>
  )
}
