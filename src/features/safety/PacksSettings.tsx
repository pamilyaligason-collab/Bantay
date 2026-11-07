import { liveQuery } from 'dexie'
import { useEffect, useState } from 'react'
import { db, type PackRow } from '../../db'
import '../shell/shell.css'
import { PACK_NAMES, PINNED, syncPacks } from './packs'

const kb = (n: number) => (n < 1_000_000 ? `${Math.max(1, Math.round(n / 1000))} KB` : `${(n / 1_000_000).toFixed(1)} MB`)
const size = (r: PackRow) => JSON.stringify(r.places).length + (r.hazards?.blob.size ?? 0) + (r.basemap?.blob.size ?? 0)
const day = (t: number) => new Date(t).toLocaleDateString('en-PH', { day: 'numeric', month: 'short', year: 'numeric' })

/** Settings > About, flag localPacks: "Safety data on this phone", one row per area with a delete button, and a button for nearby areas. */
export default function PacksSettings() {
  const [rows, setRows] = useState<PackRow[] | null>(null)
  const [note, setNote] = useState('')
  useEffect(() => {
    const sub = liveQuery(() => db.packs.toArray()).subscribe({ next: setRows, error: () => setRows([]) })
    return () => sub.unsubscribe()
  }, [])
  const total = (rows ?? []).reduce((n, r) => n + size(r), 0)
  const updated = Math.max(0, ...(rows ?? []).map((r) => r.fetchedAt))
  const nearby = async () => {
    setNote('Looking...')
    const home = (await db.packs.toArray()).sort((a, b) => b.usedAt - a.usedAt)[0]?.code ?? null
    const r = await syncPacks(home, { tapped: true })
    setNote(r.offline ? 'No signal. Try again later.' : r.bad.length ? 'Some files did not check out. They will be tried again.' : r.fetched.length ? `Added ${r.fetched.length} area${r.fetched.length === 1 ? '' : 's'}.` : 'Nothing new.')
  }
  return (
    <div className="sh-card sh-list st-list" data-testid="packs-settings">
      <div>
        <div className="sh-grow"><b>Safety data on this phone</b><div className="sh-sub" role="status">{rows === null ? 'Reading...' : rows.length ? `${rows.length} area${rows.length === 1 ? '' : 's'}, ${kb(total)}, updated ${day(updated)}` : 'None downloaded yet. Home areas are built in.'}</div></div>
      </div>
      {(rows ?? []).map((r) => (
        <div key={r.code} data-testid={`pack-row-${r.code}`}>
          <div className="sh-grow"><b>{PACK_NAMES[r.code] ?? r.name}</b><div className="sh-sub">{kb(size(r))}{r.hazards ? ' · hazard map' : ''}{r.basemap ? ' · street map' : ''}{(PINNED as readonly string[]).includes(r.code) ? ' · home area' : ''}</div></div>
          <button type="button" className="sh-pill sh-ghost sh-small" aria-label={`Delete ${PACK_NAMES[r.code] ?? r.name}`} onClick={() => void db.packs.delete(r.code)}>Delete</button>
        </div>
      ))}
      <div>
        <div className="sh-grow"><b>Download nearby areas</b><div className="sh-sub">{note || 'Places and numbers for the areas around you. Wi-Fi is best.'}</div></div>
        <button type="button" className="sh-pill sh-ghost sh-small" onClick={() => void nearby()}>Download</button>
      </div>
      <p className="sh-sub sh-note">Hazard data: UP NOAH Center (Project NOAH), ODbL 1.0. Area outlines: geoBoundaries, CC BY 3.0 IGO.</p>
    </div>
  )
}
