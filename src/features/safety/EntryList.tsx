import { useState } from 'react'
import { db } from '../../db'
import { type Entry, googleGo, forZone, hasPoint, NOT_CONFIRMED, organicUrl, osmUrl, OVERRIDES_KEY, type Overrides, parseEdit, telHref, withOverrides } from './entries'
import { putKv, useKv } from './store'
import './safety.css'

const NONE: Overrides = {}

export function EditForm({ entry, geo, onDone }: { entry: Entry; geo: boolean; onDone: () => void }) {
  const [f, setF] = useState({ lat: '', lon: '', phone: '' })
  const [err, setErr] = useState('')
  const on = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })
  const save = async (e: { preventDefault(): void }) => {
    e.preventDefault()
    const r = parseEdit(f, geo)
    if (!r.ok) return setErr(r.error)
    const cur = ((await db.kv.get(OVERRIDES_KEY))?.value as Overrides | undefined) ?? {}
    await putKv(OVERRIDES_KEY, { ...cur, [entry.id]: { ...cur[entry.id], ...r.patch } })
    onDone()
  }
  return (
    <form className="sf-edit" onSubmit={save} aria-label={`Add details for ${entry.name}`}>
      {geo ? (
        <>
          <label>Latitude<input inputMode="decimal" value={f.lat} onChange={on('lat')} placeholder="9.6457" /></label>
          <label>Longitude<input inputMode="decimal" value={f.lon} onChange={on('lon')} placeholder="123.8779" /></label>
        </>
      ) : (
        <label>Phone number<input inputMode="tel" value={f.phone} onChange={on('phone')} /></label>
      )}
      {err && <p className="err" role="alert">{err}</p>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="submit" className="btn">Save</button>
        <button type="button" className="btn2" onClick={onDone}>Cancel</button>
      </div>
    </form>
  )
}

/** Grouped, editable list. geo = places with a map pin and Go button; otherwise hotlines with a phone number. */
export default function EntryList({ seed, geo, zone }: { seed: Entry[]; geo: boolean; zone: string }) {
  const overrides = useKv<Overrides>(OVERRIDES_KEY, NONE)
  const [editing, setEditing] = useState<string | null>(null)
  const entries = withOverrides(forZone(seed, zone), overrides)
  const groups = [...new Set(entries.map((e) => e.group))]
  if (!entries.length) return <p className="sf-empty">Nothing confirmed for this zone yet. Ask the barangay hall.</p>
  return (
    <div className="sf">
      {groups.map((g) => (
        <section key={g}>
          <p className="sec">{g}</p>
          <div className="grp">
            {entries.filter((e) => e.group === g).map((e) => (
              <div key={e.id}>
                <div className="row">
                  <span className="grow">
                    <span>{e.name}</span>
                    {e.note && <span className="sub" style={{ fontSize: 14 }}>{e.note}</span>}
                  </span>
                  {geo ? (
                    hasPoint(e) ? (
                      <span style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
                        <a className="sf-go" href={googleGo(e.lat, e.lon)} target="_blank" rel="noopener noreferrer" aria-label={`Go to ${e.name}`}>Go</a>
                        <span style={{ fontSize: 13 }}>
                          <a href={osmUrl(e.lat, e.lon)} target="_blank" rel="noopener noreferrer">OpenStreetMap</a>{' '}
                          <a href={organicUrl(e.lat, e.lon, e.name)}>Organic Maps</a>
                        </span>
                      </span>
                    ) : (
                      <button className="sf-act" style={{ color: 'var(--warn)' }} onClick={() => setEditing(e.id)}>{NOT_CONFIRMED}</button>
                    )
                  ) : e.phone ? (
                    <a href={telHref(e.phone)} style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{e.phone}</a>
                  ) : (
                    <button className="sf-act" style={{ color: 'var(--warn)' }} onClick={() => setEditing(e.id)}>{NOT_CONFIRMED}</button>
                  )}
                </div>
                {editing === e.id && <EditForm entry={e} geo={geo} onDone={() => setEditing(null)} />}
                <p className="sf-src">
                  {e.status === 'UNKNOWN' ? 'Unconfirmed. ' : ''}Source: {e.source}, {e.date}.
                  {e.sourceUrl && <> <a href={e.sourceUrl} target="_blank" rel="noopener noreferrer">Link</a></>}
                </p>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
