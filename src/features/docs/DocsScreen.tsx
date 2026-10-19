// "IDs and insurance" (D-63): shows each card full screen from the phone's own cache, uploads when one is missing.
// Bantay keeps the picture only: no OCR, no numbers read or stored, nothing is sent to a model.
import type { SupabaseClient } from '@supabase/supabase-js'
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../auth/client'
import { addCard, canUse, decideDriveCard, ensureOwner, fetchPeople, fixType, flushQueue, refreshCards, retryCard } from './api'
import { buildDocs, COMMON, ddb, LABEL, SHORT, TYPES_FOR, type CardRow, type CardType, type DocRow, type DriveCard, type Kind, type PersonRow, type Side } from './store'
import { SubHeader } from '../shell/SubHeader'
import { useDialog } from './useDialog'
import './docs.css'

const kindFromHash = (): Kind => (location.hash.startsWith('#docs/insurance') ? 'insurance_card' : 'id_card')
const online = () => typeof navigator === 'undefined' || navigator.onLine !== false
const when = (t: number) => new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
/** First name for chips; adds the next initial only when two people share one. */
const short = (x: { name: string }, all: { name: string }[]) => {
  const [f = x.name, l = ''] = x.name.trim().split(/\s+/)
  return all.filter((y) => y.name.trim().split(/\s+/)[0] === f).length > 1 && l ? `${f} ${l[0]}.` : f
}
const nameOf = (d: Pick<DocRow, 'kind' | 'cardType' | 'title'>) => d.title || LABEL[d.kind][d.cardType] || 'Card'
const WAITING = 'Saved on this phone, waiting to upload'

function Viewer({ doc, side: first, onClose, onRetry }: { doc: DocRow; side: Side; onClose: () => void; onRetry: () => void }) {
  const { ref, onKeyDown } = useDialog(onClose)
  const [side, setSide] = useState<Side>(first)
  const card: CardRow | undefined = doc[side] ?? doc.front ?? doc.back
  const [url, setUrl] = useState('')
  useEffect(() => {
    if (!card || typeof URL.createObjectURL !== 'function') return
    const u = URL.createObjectURL(card.blob) // a local object URL for a picture already on this phone; nothing is fetched
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [card])
  const both = !!(doc.front && doc.back)
  return createPortal(
    <div className="dc-viewer" role="dialog" aria-modal="true" aria-labelledby="dc-vt" ref={ref} onKeyDown={onKeyDown}>
      <div className="dc-vbar">
        <h2 id="dc-vt">{nameOf(doc)}</h2>
        <button className="dc-btn" data-autofocus onClick={onClose}>Close</button>
      </div>
      {doc.failed && (
        <div className="dc-vfail" role="alert">
          <span>Could not upload. The picture is safe on this phone.</span>
          <button className="dc-btn" onClick={onRetry}>Retry</button>
        </div>
      )}
      {both && (
        <div className="seg dc-vseg" role="group" aria-label="Side of the card">
          <button aria-pressed={side === 'front'} onClick={() => setSide('front')}>Front</button>
          <button aria-pressed={side === 'back'} onClick={() => setSide('back')}>Back</button>
        </div>
      )}
      <div className="dc-vbody">
        {card?.mime === 'application/pdf'
          ? <object data={url} type="application/pdf" aria-label={`${nameOf(doc)}, PDF`}>This phone cannot show the PDF here.</object>
          : url && <img src={url} alt={`${nameOf(doc)}, ${card?.side ?? 'front'}`} />}
      </div>
    </div>,
    document.body
  )
}

function UploadSheet(p: { owner: string; people: PersonRow[]; forId: string; kind: Kind; cardType: CardType; addTo?: DocRow; onSaved: () => void; onClose: () => void }) {
  const { ref, onKeyDown } = useDialog(p.onClose)
  const [forId, setForId] = useState(p.forId)
  const [type, setType] = useState<CardType>(p.addTo?.cardType ?? p.cardType)
  const [title, setTitle] = useState('')
  const [step, setStep] = useState<'pick' | 'back'>(p.addTo ? 'back' : 'pick')
  const [docId, setDocId] = useState<string | undefined>(p.addTo?.docId)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const cam = useRef<HTMLInputElement>(null)
  const pick = useRef<HTMLInputElement>(null)
  const side: Side = step === 'back' ? 'back' : 'front'
  useEffect(() => { if (step === 'back') ref.current?.querySelector<HTMLElement>('button')?.focus() }, [step, ref])

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0]
    e.target.value = ''
    if (!picked) return
    const file = await fixType(picked)
    if (!canUse(file)) return setErr('That file cannot be used. Choose a photo (JPEG, PNG, WebP or HEIC) or a PDF under 15 MB.')
    setErr('')
    setBusy(true)
    try {
      const r = await addCard({
        file, side, docId, kind: p.kind, owner: p.owner,
        personId: p.addTo?.personId ?? forId,
        cardType: p.addTo?.cardType ?? type,
        title: p.addTo ? p.addTo.title : title
      })
      setDocId(r.docId)
      p.onSaved()
      if (side === 'front' && file.type !== 'application/pdf') setStep('back')
      else p.onClose()
    } catch {
      setErr('Could not save on this phone. Free some space and try again.')
    }
    setBusy(false)
  }

  const actions = (
    <div className="grp dc-actions">
      <button className="row" disabled={busy} onClick={() => cam.current?.click()}><b className="grow">{step === 'back' ? 'Take a photo of the back' : 'Take a photo, front then back'}</b></button>
      <button className="row" disabled={busy} onClick={() => pick.current?.click()}><b className="grow">Choose a photo or PDF</b></button>
      <input ref={cam} type="file" accept="image/*" capture="environment" hidden data-testid="docs-camera" onChange={onFile} />
      <input ref={pick} type="file" accept="image/*,application/pdf" hidden data-testid="docs-file" onChange={onFile} />
    </div>
  )

  return createPortal(
    <div className="dc-scrim" onClick={p.onClose}>
      <div className="dc-sheet" role="dialog" aria-modal="true" aria-labelledby="dc-st" ref={ref} onKeyDown={onKeyDown} onClick={(e) => e.stopPropagation()}>
        {step === 'pick' ? (
          <>
            <h2 id="dc-st">Add an ID or insurance card</h2>
            <div className="dc-chips" role="group" aria-label="For">
              <span className="sub">For</span>
              {p.people.map((x) => <button key={x.id} className="dc-chip" aria-pressed={x.id === forId} onClick={() => setForId(x.id)}>{short(x, p.people)}</button>)}
            </div>
            <label className="dc-field">Card
              <select value={type} onChange={(e) => setType(e.target.value as CardType)}>
                {TYPES_FOR[p.kind].map((t) => <option key={t} value={t}>{LABEL[p.kind][t]}</option>)}
              </select>
            </label>
            <label className="dc-field">Label (optional)
              <input value={title} maxLength={40} autoComplete="off" onChange={(e) => setTitle(e.target.value)} />
            </label>
            {actions}
            <p className="sub dc-note">Saved to the family Drive and your records when you have signal. Only you, the admins and the people who keep your records can see it. Bantay keeps the picture only; it does not read the numbers.</p>
            {err && <p className="dc-err" role="alert">{err}</p>}
            <button className="btn2" onClick={p.onClose}>Cancel</button>
          </>
        ) : (
          <>
            <h2 id="dc-st">{p.addTo ? 'Add the back' : 'Now the back of the card'}</h2>
            {!p.addTo && <p className="sub dc-note" role="status">{online() ? 'Front saved on this phone.' : WAITING + '.'}</p>}
            {actions}
            {err && <p className="dc-err" role="alert">{err}</p>}
            <button className="btn2" onClick={p.onClose}>{p.addTo ? 'Cancel' : 'Done, front only'}</button>
          </>
        )}
      </div>
    </div>,
    document.body
  )
}

/** A card that is only in the family Drive. Check the type, then Confirm or Reject. The Drive file is never opened. */
function DriveRow({ card, client, onDone }: { card: DriveCard; client: SupabaseClient | null; onDone: () => void }) {
  const [type, setType] = useState<CardType>(card.cardType)
  const [err, setErr] = useState('')
  const name = card.title || LABEL[card.kind][card.cardType] || 'Card'
  const go = async (status: 'confirmed' | 'rejected') => {
    setErr('')
    if (client && online() && (await decideDriveCard(client, { docId: card.docId, cardType: type }, status))) return onDone()
    setErr('Could not save. Try again when you have signal.')
  }
  return (
    <div className="row dc-drive" role="listitem">
      <span className="dc-thumb" aria-hidden="true">{SHORT[card.cardType] ?? 'ID'}</span>
      <div className="grow">
        <b>{name}</b>
        <div className="sub">In the family Drive · not on this phone</div>
        {card.status === 'draft' && (
          <div className="dc-decide">
            <label className="dc-field">Card type
              <select value={type} onChange={(e) => setType(e.target.value as CardType)}>
                {TYPES_FOR[card.kind].map((t) => <option key={t} value={t}>{LABEL[card.kind][t]}</option>)}
              </select>
            </label>
            <div className="dc-chips">
              <button className="dc-btn dc-primary" aria-label={`Confirm ${name}`} onClick={() => void go('confirmed')}>Confirm</button>
              <button className="dc-btn" aria-label={`Reject ${name}`} onClick={() => void go('rejected')}>Reject</button>
            </div>
            {err && <p className="dc-err" role="alert">{err}</p>}
          </div>
        )}
      </div>
    </div>
  )
}

export function DocsScreen({ client = supabase }: { client?: SupabaseClient | null }) {
  const [kind, setKind] = useState<Kind>(kindFromHash)
  const [people, setPeople] = useState<PersonRow[]>([])
  const [cards, setCards] = useState<CardRow[]>([])
  const [drive, setDrive] = useState<DriveCard[]>([])
  const [owner, setOwner] = useState('')
  const [forPick, setForPick] = useState('')
  const [view, setView] = useState<{ doc: DocRow; side: Side } | null>(null)
  const [sheet, setSheet] = useState<{ cardType: CardType; addTo?: DocRow } | null>(null)

  const reload = useCallback(async () => {
    try {
      const o = await ensureOwner(client) // a different user on this phone: the cache is wiped before anything is shown
      const [p, c, d] = await Promise.all([ddb.people.toArray(), ddb.cards.toArray(), ddb.driveOnly.toArray()])
      setOwner(o)
      setPeople(p.sort((a, b) => Number(b.self) - Number(a.self)))
      setCards(c.filter((x) => x.owner === o)) // another user's waiting uploads stay stored, never shown
      setDrive(d)
    } catch { /* storage blocked: the screen stays empty */ }
  }, [client])
  const sync = useCallback(async () => {
    await reload()
    if (!client || !online()) return
    const o = await ensureOwner(client)
    await flushQueue(client, o)
    const p = await fetchPeople(client)
    if (p) { await ddb.people.clear(); await ddb.people.bulkPut(p) }
    await refreshCards(client, p ?? (await ddb.people.toArray()), o)
    await reload()
  }, [client, reload])
  useEffect(() => {
    void sync()
    const on = () => void sync()
    const hash = () => setKind(kindFromHash())
    window.addEventListener('online', on)
    window.addEventListener('hashchange', hash)
    return () => { window.removeEventListener('online', on); window.removeEventListener('hashchange', hash) }
  }, [sync])

  const forId = people.some((x) => x.id === forPick) ? forPick : (people[0]?.id ?? '')
  const docs = useMemo(() => buildDocs(cards, kind, forId), [cards, kind, forId])
  const driveRows = drive.filter((d) => d.kind === kind && d.personId === forId)
  const missing = COMMON[kind].filter((t) => !docs.some((d) => d.cardType === t) && !driveRows.some((d) => d.cardType === t))
  const choose = (k: Kind) => { setKind(k); history.replaceState(null, '', k === 'insurance_card' ? '#docs/insurance' : '#docs') }
  const saved = () => { void reload(); if (online()) void flushQueue(client, owner).then(reload) }

  return (
    <>
      <SubHeader title="IDs and insurance" backHref="#safety" backLabel="Back to Safety" className="sf-hdr sf-subhdr" />
      <p className="sub dc-note">Seen only by you, the admins and whoever keeps your records · saved for offline</p>
      <div className="seg" role="group" aria-label="Kind">
        <button aria-pressed={kind === 'id_card'} onClick={() => choose('id_card')}>My IDs</button>
        <button aria-pressed={kind === 'insurance_card'} onClick={() => choose('insurance_card')}>Insurance</button>
      </div>
      {people.length > 1 && (
        <div className="dc-chips" role="group" aria-label="Whose cards">
          <span className="sub">For</span>
          {people.map((x) => <button key={x.id} className="dc-chip" aria-pressed={x.id === forId} onClick={() => setForPick(x.id)}>{short(x, people)}</button>)}
        </div>
      )}
      {people.length === 0 ? (
        <div className="grp"><div className="row"><span className="grow">Nothing here yet<span className="sub">Open Bantay once with signal so it can set this up.</span></span></div></div>
      ) : (
        <div className="grp" aria-label={kind === 'id_card' ? 'IDs' : 'Insurance cards'} role="list">
          {docs.map((d) => (
            <div className="row" role="listitem" key={d.docId}>
              <span className="dc-thumb" aria-hidden="true">{SHORT[d.cardType] ?? 'ID'}</span>
              <div className="grow">
                <b>{nameOf(d)}</b>
                <div className="sub">{d.failed ? 'Could not upload. Tap Show, then Retry' : d.pending ? WAITING : `${d.front && d.back ? 'Front and back' : d.front ? 'Front only · back missing' : 'Back only · front missing'} · added ${when(d.updated)}`}</div>
              </div>
              {d.front && !d.back && d.front.mime !== 'application/pdf' && (
                <button className="dc-btn" aria-label={`Add back of ${nameOf(d)}`} onClick={() => setSheet({ cardType: d.cardType, addTo: d })}>Add back</button>
              )}
              <button className="dc-btn" aria-label={`Show ${nameOf(d)}`} onClick={() => setView({ doc: d, side: d.front ? 'front' : 'back' })}>Show</button>
            </div>
          ))}
          {driveRows.map((d) => <DriveRow key={d.docId} card={d} client={client} onDone={() => void reload()} />)}
          {missing.map((t) => (
            <div className="row" role="listitem" key={t}>
              <span className="dc-thumb miss" aria-hidden="true">+</span>
              <div className="grow"><b>{LABEL[kind][t]}</b><div className="sub">Not added yet</div></div>
              <button className="dc-btn dc-primary" aria-label={`Upload ${LABEL[kind][t]}`} onClick={() => setSheet({ cardType: t })}>Upload</button>
            </div>
          ))}
          <div className="row" role="listitem">
            <div className="grow"><b>Another card</b><div className="sub">Pick the type when you upload</div></div>
            <button className="dc-btn" aria-label="Upload another card" onClick={() => setSheet({ cardType: 'other' })}>Upload</button>
          </div>
        </div>
      )}
      <p className="sub dc-note">Photos go to the family Drive and your records when you have signal. Bantay keeps the picture only; it does not read or store the numbers.</p>
      {view && <Viewer doc={view.doc} side={view.side} onClose={() => setView(null)} onRetry={() => { setView(null); void retryCard(view.doc.docId).then(saved) }} />}
      {sheet && <UploadSheet owner={owner} people={people} forId={forId} kind={kind} cardType={sheet.cardType} addTo={sheet.addTo} onSaved={saved} onClose={() => setSheet(null)} />}
    </>
  )
}

export default DocsScreen
