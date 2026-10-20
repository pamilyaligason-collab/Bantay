// "Scan a paper": photograph each page, tidy the corners, say whose paper it is, then queue it (src/features/docs/api.ts addScan).
// The Android app uses Google's scanner screen when this build has it; the browser uses the camera and the crop screen below.
import type { SupabaseClient } from '@supabase/supabase-js'
import { useCallback, useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent, type PointerEvent } from 'react'
import { supabase } from '../auth/client'
import { addScan, drainQueue, ensureOwner, fetchPeople, fixType, type ScanChoice } from '../docs/api'
import { short } from '../docs/DocsScreen'
import { ddb, type PersonRow } from '../docs/store'
import { Icon } from '../shell/Icon'
import { SubHeader } from '../shell/SubHeader'
import { convex, defaultQuad, type Mode, type Quad } from './crop'
import { scannerKind, scanNative } from './nativeScan'
import { closeScan } from './open'
import { cropToJpeg, decodePhoto, rotateCanvas } from './pipeline'
import './scan.css'

type Page = { id: string; blob: Blob; url: string }
type Stage = 'start' | 'crop' | 'pages' | 'form'
const KINDS: { id: ScanChoice; label: string }[] = [
  { id: 'lab', label: 'Lab result' },
  { id: 'prescription', label: 'Prescription' },
  { id: 'id', label: 'ID or insurance' },
  { id: 'other', label: 'Other' }
]
const CORNERS = ['Top left', 'Top right', 'Bottom right', 'Bottom left']
const clamp = (n: number) => Math.min(1, Math.max(0, n))
const online = () => typeof navigator === 'undefined' || navigator.onLine !== false
const makeUrl = (b: Blob) => (typeof URL.createObjectURL === 'function' ? URL.createObjectURL(b) : '')
const today = () => new Date().toLocaleDateString('en-CA') // YYYY-MM-DD in local time

/** The photo with four draggable corners. Coordinates are 0..1 of the photo; each handle is a 44px touch target. */
function CropView({ src, quad, onQuad }: { src: HTMLCanvasElement; quad: Quad; onQuad: (q: Quad) => void }) {
  const box = useRef<HTMLDivElement>(null)
  const view = useRef<HTMLCanvasElement>(null)
  const drag = useRef(-1)
  useEffect(() => { // the on-screen copy is small; the full-size canvas stays in memory for the crop
    const v = view.current
    if (!v) return
    const k = Math.min(1, 1200 / Math.max(src.width, src.height))
    v.width = Math.round(src.width * k)
    v.height = Math.round(src.height * k)
    v.getContext('2d')?.drawImage(src, 0, 0, v.width, v.height)
  }, [src])
  const set = (i: number, x: number, y: number) => onQuad(quad.map((p, j) => (j === i ? { x: clamp(x), y: clamp(y) } : p)) as Quad)
  const move = (i: number, e: PointerEvent) => {
    const r = box.current?.getBoundingClientRect()
    if (drag.current !== i || !r?.width) return
    set(i, (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height)
  }
  const key = (i: number, e: KeyboardEvent) => {
    const d = { ArrowLeft: [-0.01, 0], ArrowRight: [0.01, 0], ArrowUp: [0, -0.01], ArrowDown: [0, 0.01] }[e.key]
    if (!d) return
    e.preventDefault()
    set(i, quad[i]!.x + d[0]!, quad[i]!.y + d[1]!)
  }
  const pts = quad.map((p) => `${p.x * 100},${p.y * 100}`).join(' ')
  return (
    <div className="sc-crop" ref={box} style={{ ['--ar' as string]: src.width / src.height }}>
      <canvas ref={view} aria-label="Your photo" role="img" />
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><polygon points={pts} /></svg>
      {quad.map((p, i) => (
        <button
          key={i} type="button" className="sc-h" data-testid={`corner-${i}`} aria-label={`${CORNERS[i]} corner. Drag, or use the arrow keys.`}
          style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
          onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); drag.current = i }}
          onPointerMove={(e) => move(i, e)}
          onPointerUp={() => { drag.current = -1 }}
          onPointerCancel={() => { drag.current = -1 }}
          onKeyDown={(e) => key(i, e)}
        />
      ))}
    </div>
  )
}

export default function ScanFlow({ client = supabase }: { client?: SupabaseClient | null }) {
  const [stage, setStage] = useState<Stage>('start')
  const [pages, setPages] = useState<Page[]>([])
  const [src, setSrc] = useState<HTMLCanvasElement | null>(null)
  const [quad, setQuad] = useState<Quad>(defaultQuad)
  const [mode, setMode] = useState<Mode>('document')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [people, setPeople] = useState<PersonRow[]>([])
  const [owner, setOwner] = useState('')
  const [forId, setForId] = useState('')
  const [kind, setKind] = useState<ScanChoice>('lab')
  const [date, setDate] = useState('')
  const cam = useRef<HTMLInputElement>(null)
  const pick = useRef<HTMLInputElement>(null)
  const urls = useRef<string[]>([])
  const native = scannerKind() === 'native'

  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL?.(u)), [])
  useEffect(() => { // who the paper can be for: the cached list first, then a fresh one when there is signal
    let live = true
    void (async () => {
      try {
        const o = await ensureOwner(client)
        const cached = await ddb.people.toArray()
        if (live) { setOwner(o); setPeople(cached.sort((a, b) => Number(b.self) - Number(a.self))) }
        if (client && online()) {
          const p = await fetchPeople(client)
          if (p && live) { await ddb.people.clear(); await ddb.people.bulkPut(p); setPeople(p.sort((a, b) => Number(b.self) - Number(a.self))) }
        }
      } catch { /* storage blocked: the form shows no names */ }
    })()
    return () => { live = false }
  }, [client])
  const who = people.some((p) => p.id === forId) ? forId : (people[0]?.id ?? '')

  const addPages = (blobs: Blob[]) => {
    const made = blobs.map((blob) => { const url = makeUrl(blob); urls.current.push(url); return { id: crypto.randomUUID(), blob, url } })
    setPages((p) => [...p, ...made])
  }
  const openCamera = () => cam.current?.click()
  const scan = async () => {
    setErr('')
    if (!native) return openCamera()
    setBusy(true)
    try {
      const got = await scanNative()
      if (got.length) { addPages(got); setStage('pages') }
    } catch {
      setErr('The scanner could not start. You can use the camera instead.')
    }
    setBusy(false)
  }

  const onPhoto = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    setErr('')
    setBusy(true)
    try {
      const file = await fixType(f)
      if (!file.type.startsWith('image/')) throw new Error('type')
      setSrc(await decodePhoto(file))
      setQuad(defaultQuad())
      setStage('crop')
    } catch {
      setErr('That photo could not be opened. Take another, or choose a JPEG or PNG.')
    }
    setBusy(false)
  }

  const rotate = () => { if (src) { setSrc(rotateCanvas(src)); setQuad(defaultQuad()) } }
  const retake = () => { setSrc(null); setStage(pages.length ? 'pages' : 'start'); openCamera() }
  /** Flatten the corners into a page. `again`: open the camera for the next one straight away. */
  const accept = async (again: boolean) => {
    if (!src) return
    if (!convex(quad)) return setErr('The corners cross over. Drag them back to the corners of the paper.')
    setErr('')
    setBusy(true)
    try {
      addPages([await cropToJpeg(src, quad, mode)])
      setSrc(null)
      setStage('pages')
      if (again) openCamera()
    } catch {
      setErr('Could not cut out that page. Try again, or retake the photo.')
    }
    setBusy(false)
  }

  const swap = (i: number, j: number) => setPages((p) => { const n = [...p]; [n[i], n[j]] = [n[j]!, n[i]!]; return n })
  const drop = (i: number) => setPages((p) => { const gone = p[i]; if (gone) URL.revokeObjectURL?.(gone.url); const n = p.filter((_, k) => k !== i); if (!n.length) setStage('start'); return n })

  const save = useCallback(async () => {
    if (!pages.length || !who) return
    setErr('')
    setBusy(true)
    try {
      await addScan({ pages: pages.map((p) => p.blob), owner, personId: who, kind, docDate: date || null })
      if (online()) void drainQueue(client)
      closeScan()
    } catch {
      setErr('Could not save on this phone. Free some space and try again.')
      setBusy(false)
    }
  }, [pages, who, owner, kind, date, client])

  return (
    <>
      <SubHeader title="Scan a paper" backHref="#health/papers" backLabel="Back" className="sc-hdr" />
      <input ref={cam} type="file" accept="image/*" capture="environment" hidden data-testid="scan-camera" onChange={onPhoto} />
      <input ref={pick} type="file" accept="image/*" hidden data-testid="scan-file" onChange={onPhoto} />
      <div className="sc">
        {stage === 'start' && (
          <>
            <p className="sub">Lay the paper flat in good light. Bantay keeps the pages on this phone, then reads them when you have signal.</p>
            <div className="grp sc-actions">
              <button type="button" className="row" disabled={busy} onClick={() => void scan()}>
                <Icon name={native ? 'scan' : 'camera'} /><b className="grow">{native ? 'Open the scanner' : 'Take a photo of page 1'}</b><Icon name="chev" />
              </button>
              <button type="button" className="row" disabled={busy} onClick={() => pick.current?.click()}>
                <Icon name="photo" /><b className="grow">Choose a photo</b><Icon name="chev" />
              </button>
            </div>
          </>
        )}

        {stage === 'crop' && src && (
          <>
            <p className="sub" id="sc-tip">Drag the four dots to the corners of the paper.</p>
            <CropView src={src} quad={quad} onQuad={setQuad} />
            <div className="seg sc-mode" role="group" aria-label="Look">
              <button type="button" aria-pressed={mode === 'document'} onClick={() => setMode('document')}>Document</button>
              <button type="button" aria-pressed={mode === 'colour'} onClick={() => setMode('colour')}>Colour</button>
            </div>
            <div className="sc-tools">
              <button type="button" className="dc-btn" disabled={busy} onClick={rotate}><Icon name="rotate" size={18} /> Rotate</button>
              <button type="button" className="dc-btn" disabled={busy} onClick={retake}><Icon name="camera" size={18} /> Retake</button>
              <button type="button" className="dc-btn" disabled={busy} onClick={() => void accept(true)}><Icon name="plus" size={18} /> Add page</button>
              <button type="button" className="dc-btn dc-primary" disabled={busy} onClick={() => void accept(false)}><Icon name="check" size={18} /> Done</button>
            </div>
          </>
        )}

        {stage === 'pages' && (
          <>
            <h2 className="hd sc-h2">{pages.length === 1 ? '1 page' : `${pages.length} pages`}</h2>
            <div className="grp" role="list" aria-label="Pages">
              {pages.map((p, i) => (
                <div className="row sc-page" role="listitem" key={p.id} data-testid="scan-page">
                  <img className="sc-thumb" src={p.url} alt={`Page ${i + 1}`} />
                  <b className="grow">Page {i + 1}</b>
                  <button type="button" className="sh-iconbtn" aria-label={`Move page ${i + 1} up`} disabled={i === 0} onClick={() => swap(i, i - 1)}><Icon name="up" /></button>
                  <button type="button" className="sh-iconbtn" aria-label={`Move page ${i + 1} down`} disabled={i === pages.length - 1} onClick={() => swap(i, i + 1)}><Icon name="down" /></button>
                  <button type="button" className="sh-iconbtn" aria-label={`Delete page ${i + 1}`} onClick={() => drop(i)}><Icon name="trash" /></button>
                </div>
              ))}
            </div>
            <div className="sc-tools">
              <button type="button" className="dc-btn" disabled={busy} onClick={() => void scan()}><Icon name="plus" size={18} /> Add page</button>
              <button type="button" className="dc-btn dc-primary" disabled={!pages.length} onClick={() => setStage('form')}>Continue</button>
            </div>
          </>
        )}

        {stage === 'form' && (
          <>
            <div className="dc-chips" role="group" aria-label="Whose paper">
              <span className="sub">For</span>
              {people.map((x) => <button key={x.id} type="button" className="dc-chip" aria-pressed={x.id === who} onClick={() => setForId(x.id)}>{short(x, people)}</button>)}
            </div>
            {people.length === 0 && <p className="sub">Open Bantay once with signal so it can list your family here.</p>}
            <div className="dc-chips" role="group" aria-label="What kind of paper">
              <span className="sub">Kind</span>
              {KINDS.map((k) => <button key={k.id} type="button" className="dc-chip" aria-pressed={k.id === kind} onClick={() => setKind(k.id)}>{k.label}</button>)}
            </div>
            <label className="dc-field">Date on the paper (optional)
              <input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} />
            </label>
            <p className="sub">{pages.length === 1 ? '1 page' : `${pages.length} pages`} will be saved on this phone and sent when you have signal. Only you, the admins and the people who keep your records can see it.</p>
            <div className="sc-tools">
              <button type="button" className="dc-btn" disabled={busy} onClick={() => setStage('pages')}>Back</button>
              <button type="button" className="dc-btn dc-primary" disabled={busy || !who} onClick={() => void save()}>Save</button>
            </div>
          </>
        )}
        {err && <p className="dc-err" role="alert">{err}</p>}
      </div>
    </>
  )
}
