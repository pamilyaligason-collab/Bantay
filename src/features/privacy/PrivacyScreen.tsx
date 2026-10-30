import { useEffect, useState } from 'react'
import { Icon } from '../shell/Icon'
import { SubHeader } from '../shell/SubHeader'
import { useKv } from '../shell/useKv'
import { useSelfPersonId } from '../setup/useProfile'
import { consentDate, ensureConsent } from './consent'
import { AI_KEY } from './ai'
import { ERASURE_KEY, cancelErasure, exportMyData, requestErasure, saveJson } from './data'
import '../shell/shell.css'
import './privacy.css'

// Where the data goes (contract D-78 copy rule): exactly what this build uses. No Firebase, Sentry or SMS gateway is named or used.
export const PROCESSORS: { name: string; what: string }[] = [
  { name: 'Supabase', what: 'your records and family messages' },
  { name: 'Open-Meteo and RainViewer', what: 'weather and rain maps; your place rounded to about 1 km' },
  { name: 'OpenRouter', what: 'the AI models behind Jack and photo reading, only when you use them (zero data retention)' },
  { name: 'Google Drive', what: 'copies of papers, in the folder the family owns' },
  { name: 'Cloudflare Pages', what: 'hosting for the app' }
]

const dayLabel = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' }) }

/** Mockup start-privacy. Reached from Me > Privacy (#privacy). */
export default function PrivacyScreen() {
  const personId = useSelfPersonId()
  const [agreed, setAgreed] = useState<string | null | undefined>(undefined) // undefined = still reading
  const [ai, setAi] = useKv<boolean>(AI_KEY, true)
  const [until, setUntil] = useKv<string | null>(ERASURE_KEY, null)
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')

  useEffect(() => {
    if (!personId) { setAgreed(null); return }
    let live = true
    void ensureConsent(personId).then((c) => { if (live) setAgreed(c.at) })
    return () => { live = false }
  }, [personId])

  const download = async () => {
    setBusy(true); setNote('')
    const r = await exportMyData()
    setBusy(false)
    if (!r.ok) return setNote(r.error)
    setNote(saveJson(`bantay-my-data-${new Date().toISOString().slice(0, 10)}.json`, r.value) ? 'Your file is downloading.' : 'This phone could not save the file.')
  }
  const del = async () => {
    setBusy(true); setNote('')
    const r = await requestErasure()
    setBusy(false); setConfirm(false)
    if (!r.ok) return setNote(r.error)
    setUntil(r.value)
  }
  const undo = async () => {
    setBusy(true); setNote('')
    const r = await cancelErasure()
    setBusy(false)
    if (!r.ok) return setNote(r.error)
    setUntil(null); setNote('Deletion cancelled. Your data stays.')
  }
  const pending = until && !Number.isNaN(Date.parse(until)) ? until : null
  const canUndo = pending !== null && Date.parse(pending) > Date.now()
  const when = consentDate(agreed)

  return (
    <div className="sh sh-me pv">
      <SubHeader title="Privacy" backHref="#me" backLabel="Back to Me" />

      <div className="sh-card sh-row pv-quiet">
        <span className="pv-tick"><Icon name="check" size={18} /></span>
        <div className="sh-grow">
          <b>{agreed === undefined ? 'Agreement' : when ? `Agreed when you joined, ${when}` : 'Agreement not recorded yet'}</b>
          <div className="sh-sub">{when ? 'You agreed to share your health records with your family.' : 'It is recorded the next time Bantay can reach the server.'}</div>
        </div>
      </div>

      <div className="sh-card sh-list">
        <a className="sh-navrow" href="#sharing">
          <Icon name="users" boxed size={20} />
          <span className="sh-grow"><b>Who can see my records</b><span className="sh-sub sh-blk">Only you, the family admins, and the people you share with.</span></span>
          <Icon name="chev" />
        </a>
        <div>
          <Icon name="chat" boxed size={20} />
          <div className="sh-grow">
            <b>Use AI for Jack and photos</b>
            <div className="sh-sub">{ai ? 'On. Sends only the text or photo you share, outside the Philippines. Turn off any time.' : 'Off. Jack and photo reading are paused. Papers you scan from now on are kept, not read by the AI.'}</div>
          </div>
          <button type="button" className="sh-switch" role="switch" aria-checked={ai} aria-label="Use AI for Jack and photos" onClick={() => setAi(!ai)} />
        </div>
        <button type="button" className="sh-navrow" disabled={busy} onClick={() => void download()}>
          <Icon name="dl" boxed size={20} />
          <span className="sh-grow"><b>Download my data</b><span className="sh-sub sh-blk">One file with all records and readings</span></span>
          <Icon name="chev" />
        </button>
        {pending ? (
          <div>
            <Icon name="trash" boxed size={20} />
            <div className="sh-grow">
              <b className="pv-bad">{canUndo ? `Your data will be deleted on ${dayLabel(pending)}` : 'Your data is being deleted'}</b>
              <div className="sh-sub">{canUndo ? 'You can undo until then.' : 'It can no longer be undone.'}</div>
            </div>
            {canUndo && <button type="button" className="sh-pill sh-ghost sh-small" disabled={busy} onClick={() => void undo()}>Undo</button>}
          </div>
        ) : (
          <button type="button" className="sh-navrow" disabled={busy} onClick={() => setConfirm(true)} aria-expanded={confirm}>
            <Icon name="trash" boxed size={20} />
            <span className="sh-grow"><b className="pv-bad">Delete my data</b><span className="sh-sub sh-blk">Deleted after 7 days. You can undo until then.</span></span>
            <Icon name="chev" />
          </button>
        )}
      </div>

      {confirm && !pending && (
        <div className="sh-card pv-confirm" role="alertdialog" aria-label="Delete my data">
          <b>Delete all your data?</b>
          <div className="sh-sub">Deleted in 7 days. You can undo until then. A log of changes is kept. Drive copies: the folder owner deletes them.</div>
          <button type="button" className="sh-pill pv-danger sh-block" disabled={busy} onClick={() => void del()}>Delete my data in 7 days</button>
          <button type="button" className="sh-pill sh-ghost sh-block" onClick={() => setConfirm(false)}>Keep my data</button>
        </div>
      )}
      {note && <p className="sh-sub sh-note" role="status">{note}</p>}

      <div className="sh-card pv-where">
        <b>Where your data goes</b>
        <ul>{PROCESSORS.map((p) => <li key={p.name}><b>{p.name}</b>: {p.what}</li>)}</ul>
        <a className="pv-link" href="/privacypolicy.html" target="_blank" rel="noopener">Full privacy notice</a>
      </div>
    </div>
  )
}
