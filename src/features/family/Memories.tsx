import { useCallback, useEffect, useRef, useState } from 'react'
import { Icon } from '../shell/Icon'
import { useKv } from '../shell/useKv'
import { addPhoto, listPhotos, removePhoto, type Photo } from './memoriesApi'
import { CAPTION_MAX, shortDay, stripToJpeg } from './memoriesLogic'
import Sheet from './Sheet'
import './memories.css'

type View = { kind: 'loading' } | { kind: 'ready'; photos: Photo[] } | { kind: 'not_set_up' } | { kind: 'unavailable' } | { kind: 'offline' } | { kind: 'failed' }
const WORDS = { not_set_up: 'Memories is not set up yet', unavailable: 'Memories needs you to be signed in', offline: 'Memories shows when you are online', failed: 'Memories could not load. Try again in a moment.' } as const

/** Memories (Family tab): photos the family adds on purpose. Off until you turn it on (kv family.memories.on). Family uploads only, location and camera details removed before upload, no face recognition. */
export default function Memories() {
  const [on, setOn, loaded] = useKv<boolean>('family.memories.on', false)
  if (!loaded) return null
  return (
    <section aria-labelledby="mem-h" data-testid="memories">
      <h2 className="hd" id="mem-h">Memories</h2>
      {on ? <MemoriesOn turnOff={() => setOn(false)} /> : (
        <div className="card mem-off">
          <p className="mem-lead">Share family photos in one private place. Off for now.</p>
          <p className="sub">Only the people in your family on Bantay can see them. Location and camera details are removed from every photo before it is saved.</p>
          <button type="button" className="btn2 mem-btn" onClick={() => setOn(true)}><Icon name="photo" size={22} />Turn on Memories</button>
        </div>
      )}
    </section>
  )
}

function MemoriesOn({ turnOff }: { turnOff: () => void }) {
  const [view, setView] = useState<View>({ kind: 'loading' })
  const [picked, setPicked] = useState<Blob | null>(null)
  const [gone, setGone] = useState<Photo | null>(null)
  const [note, setNote] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const load = useCallback(async () => {
    const r = await listPhotos()
    setView(r.ok ? { kind: 'ready', photos: r.data } : { kind: r.error })
  }, [])
  useEffect(() => { void load() }, [load])

  const onFile = async (f: File | undefined) => {
    if (!f) return
    setNote('')
    const jpeg = await stripToJpeg(f) // the original never leaves this function
    if (!jpeg) { setNote('That file is not a picture Bantay can read.'); return }
    setPicked(jpeg)
  }

  return (
    <>
      {view.kind === 'loading' && <div className="card"><p className="sub fm-empty" role="status">Loading</p></div>}
      {view.kind !== 'loading' && view.kind !== 'ready' && <div className="card" role="status" data-testid="mem-state"><b>{WORDS[view.kind]}</b></div>}
      {view.kind === 'ready' && (
        <ul className="mem-strip" aria-label="Family photos">
          <li className="mem-tile">
            <button type="button" className="mem-add" onClick={() => input.current?.click()}><span className="mem-img"><Icon name="plus" size={28} /></span><b>Add a photo</b></button>
          </li>
          {view.photos.map((p) => (
            <li className="mem-tile" key={p.id}>
              <span className="mem-img">{p.url ? <img src={p.url} alt={p.caption ?? 'Family photo'} loading="lazy" /> : <Icon name="photo" size={28} />}</span>
              <span className="mem-cap"><b>{p.caption ?? 'Photo'}</b><span className="sub">{shortDay(p.takenOn ?? p.createdAt) ?? ''}</span></span>
              {p.mine && <button type="button" className="mem-del" onClick={() => setGone(p)} aria-label={`Delete ${p.caption ?? 'this photo'}`}><Icon name="trash" size={20} /></button>}
            </li>
          ))}
        </ul>
      )}
      <input ref={input} type="file" accept="image/*" hidden data-testid="mem-file" onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = '' }} />
      {note && <p className="sub" role="status">{note}</p>}
      <p className="sub mem-privacy"><Icon name="shield" size={18} /> Only your family on Bantay sees these. Location and camera details are removed from every photo.</p>
      <button type="button" className="mem-off-link" onClick={turnOff}>Turn Memories off on this phone</button>

      {picked && <AddSheet jpeg={picked} onClose={() => setPicked(null)} onDone={() => { setPicked(null); void load() }} />}
      {gone && <DeleteSheet p={gone} onClose={() => setGone(null)} onDone={() => { setGone(null); void load() }} />}
    </>
  )
}

function AddSheet({ jpeg, onClose, onDone }: { jpeg: Blob; onClose: () => void; onDone: () => void }) {
  const [caption, setCaption] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [src] = useState(() => URL.createObjectURL(jpeg))
  useEffect(() => () => URL.revokeObjectURL(src), [src])
  const save = async () => {
    setBusy(true); setErr('')
    const r = await addPhoto(jpeg, caption, null)
    setBusy(false)
    if (r.ok) return onDone()
    setErr(r.error === 'not_set_up' ? WORDS.not_set_up : r.error === 'offline' ? 'You are offline. Try again when you are connected.' : 'The photo did not save. Try again.')
  }
  return (
    <Sheet title="Add a photo" onClose={onClose}>
      <img className="mem-prev" src={src} alt="The photo you picked" />
      <div className="fm-form">
        <label htmlFor="mem-cap">Caption (optional)</label>
        <input id="mem-cap" maxLength={CAPTION_MAX} value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Sunday lunch" />
      </div>
      <p className="sub">Location and camera details are already removed. Your family on Bantay will see this photo.</p>
      {err && <p className="fm-warn" role="alert">{err}</p>}
      <button type="button" className="btn mem-btn" disabled={busy} onClick={() => void save()}>{busy ? 'Saving' : 'Add to Memories'}</button>
    </Sheet>
  )
}

function DeleteSheet({ p, onClose, onDone }: { p: Photo; onClose: () => void; onDone: () => void }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const go = async () => {
    setBusy(true); setErr('')
    const r = await removePhoto(p)
    setBusy(false)
    if (r.ok) return onDone()
    setErr('The photo was not deleted. Try again.')
  }
  return (
    <Sheet title="Delete this photo?" onClose={onClose}>
      <p>It is removed for everyone in your family. This cannot be undone.</p>
      {err && <p className="fm-warn" role="alert">{err}</p>}
      <button type="button" className="btn mem-btn mem-danger" disabled={busy} onClick={() => void go()}><Icon name="trash" size={22} />{busy ? 'Deleting' : 'Delete photo'}</button>
      <button type="button" className="btn2 mem-btn" onClick={onClose}>Keep it</button>
    </Sheet>
  )
}
