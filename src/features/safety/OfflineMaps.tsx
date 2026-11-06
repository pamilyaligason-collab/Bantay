import { useCallback, useEffect, useState } from 'react'
import { GroupedList, LargeTitle, Row, Section } from '../look'
import { usePlace } from '../location/useLocation'
import { Icon } from '../shell/Icon'
import { Switch } from '../world/Switch'
import { basemapEntries, downloadBasemap, removeBasemap, type StoredBasemap, useStoredBasemaps } from './basemap'
import { FLAGS } from './flags'
import { getIndex, type PackIndex, syncPacks } from './packs'
import { putKv, useKv } from './store'
import './offline.css'

const KEY = 'safety.offlinePrefs'
const DEFAULT = { wifiOnly: true }
/** The two basemap zones (D-131). The index names the packs; these are the names members know. */
const NAMES: Record<string, string> = { '0701200000': 'Bohol', '1206300000': 'South Cotabato and General Santos' }

export const mb = (n: number) => (n <= 0 ? 'None' : n < 1_000_000 ? `${Math.max(1, Math.round(n / 1000))} KB` : n < 1_000_000_000 ? `${(n / 1_000_000).toFixed(1)} MB` : `${(n / 1_000_000_000).toFixed(1)} GB`)
const when = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-PH', { day: 'numeric', month: 'short' }) }

/** The stored basemap whose box holds this position, or null. Unknown position is no match (ML-05). */
export function basemapAt(stored: StoredBasemap[], lat: number | null | undefined, lon: number | null | undefined): StoredBasemap | null {
  if (typeof lat !== 'number' || typeof lon !== 'number') return null
  return stored.find((s) => lon >= s.bounds[0] && lon <= s.bounds[2] && lat >= s.bounds[1] && lat <= s.bounds[3]) ?? null
}

/** Why a download did not finish, in words (downloadBasemap folds a bad response and a sha256 mismatch into 'bad'; nothing is saved either way). */
export const WHY: Record<'wait' | 'none' | 'bad' | 'offline', string> = {
  wait: 'Waiting for Wi-Fi. Turn Wi-Fi only off to use mobile data.',
  none: 'This map is not in the list yet. Try again later.',
  bad: 'The file did not download or did not match, so nothing was saved. Try again.',
  offline: 'No signal. Try again when you are online.'
}

/** Offline maps (D-131): the basemap files the index lists, each downloaded whole to this phone. Flag off: an honest empty state. */
export default function OfflineMaps() {
  return (
    <>
      <LargeTitle title="Offline maps" back={{ href: '#safety', label: 'Safety' }} />
      {FLAGS.offlineMaps ? <Maps /> : <p className="ofm-empty">Offline maps are not ready yet. They arrive with the Bohol map pack.</p>}
    </>
  )
}

function Maps() {
  const raw = useKv<Partial<typeof DEFAULT> | undefined>(KEY, undefined)
  const prefs = { ...DEFAULT, ...(raw ?? {}) }
  const stored = useStoredBasemaps()
  const place = usePlace()
  const [index, setIndex] = useState<PackIndex | null | undefined>(undefined) // undefined = still asking
  const [busy, setBusy] = useState<string[]>([])
  const [removing, setRemoving] = useState<string[]>([])
  const [fail, setFail] = useState<Record<string, string>>({})
  const [space, setSpace] = useState<{ usage: number; quota: number } | null>(null)
  useEffect(() => { let on = true; void getIndex().catch(() => null).then((i) => { if (on) setIndex(i) }); return () => { on = false } }, [])
  useEffect(() => {
    let on = true
    void (navigator.storage?.estimate?.() ?? Promise.resolve(null)).then((e) => { if (on && e && typeof e.usage === 'number' && typeof e.quota === 'number' && e.quota > 0) setSpace({ usage: e.usage, quota: e.quota }) }).catch(() => undefined)
    return () => { on = false }
  }, [stored.length])

  const listed = basemapEntries(index ?? null).filter((e) => e.code !== 'world') // no world row (D-131)
  const codes = [...new Set([...listed.map((e) => e.code), ...stored.map((s) => s.code)])]
  const nameOf = (c: string) => NAMES[c] ?? index?.packs.find((p) => p.code === c)?.name ?? c
  const here = basemapAt(stored, place?.weather.lat, place?.weather.lon)
  const used = stored.reduce((n, s) => n + s.blob.size, 0)

  const get = useCallback(async (code: string) => {
    setBusy((b) => [...b, code]); setFail(({ [code]: _x, ...f }) => f)
    try {
      // a tap is the person's choice: block only a connection known to be cellular; an unknown type (iPhone, Firefox) downloads
      const cellular = (navigator as unknown as { connection?: { type?: string } }).connection?.type === 'cellular'
      const d = { tapped: !prefs.wifiOnly || !cellular }
      let r = await downloadBasemap(code, d)
      // the unit's pack row must exist first (a phone with Safety data off has none): fetch the small place files, then try once more
      if (r === 'none') { await syncPacks(code, { ...d, wifi: undefined }); r = await downloadBasemap(code, d) }
      if (r !== 'done') setFail((f) => ({ ...f, [code]: WHY[r] }))
    } catch { setFail((f) => ({ ...f, [code]: WHY.bad })) }
    finally { setBusy((b) => b.filter((c) => c !== code)) }
  }, [prefs.wifiOnly])

  const drop = async (code: string) => {
    setRemoving((b) => [...b, code]); setFail(({ [code]: _x, ...f }) => f)
    try { await removeBasemap(code) } catch { setFail((f) => ({ ...f, [code]: 'Could not remove this map. Try again.' })) }
    finally { setRemoving((b) => b.filter((c) => c !== code)) }
  }

  return (
    <>
      {here && (
        <div className="card ofm-hero" data-testid="ofm-hero">
          <span className="ofm-check" aria-hidden="true"><Icon name="check" size={20} /></span>
          <div className="ofm-hero-t">
            <b role="status">Your area is ready offline</b>
            <span className="rw-sub">{nameOf(here.code)} · {mb(here.blob.size)} · saved {when(here.savedAt)}</span>
          </div>
          <p className="ofm-note">Streets and places on the maps work without signal.</p>
        </div>
      )}
      <Section title="Regions">
        <GroupedList label="Map files" testId="ofm-list">
          {codes.map((c) => {
            const have = stored.find((s) => s.code === c)
            const e = listed.find((x) => x.code === c)
            const state = busy.includes(c) ? 'Downloading' : have ? 'Ready' : 'Not downloaded'
            const size = have ? mb(have.blob.size) : e ? mb(e.size) : ''
            const sub = [state, size, have ? `saved ${when(have.savedAt)}` : ''].filter(Boolean).join(' · ') // the state rides in the sub line: a value beside the button squeezed long names
            return (
              <Row key={c} testId={`ofm-row-${c}`} icon="map" tint={have ? 'green' : 'blue'} title={nameOf(c)} sub={sub}
                control={have
                  ? <button type="button" className="ofm-btn" aria-label={`Remove ${nameOf(c)}`} disabled={busy.includes(c) || removing.includes(c)} onClick={() => void drop(c)}>{removing.includes(c) ? 'Removing' : 'Remove'}</button>
                  : <button type="button" className="ofm-btn ofm-go" aria-label={`Download ${nameOf(c)}`} disabled={busy.includes(c) || !e} onClick={() => void get(c)}>Download</button>} />
            )
          })}
        </GroupedList>
        {codes.map((c) => fail[c] && <p key={c} className="ofm-fail" role="alert">{nameOf(c)}: {fail[c]}</p>)}
        {index === undefined && <p className="ofm-foot" role="status">Looking for the map list...</p>}
        {index === null && !codes.length && <p className="ofm-foot" role="status">The map list needs internet. Try again when you are online.</p>}
      </Section>
      <Section title="Storage">
        <div className="card ofm-store">
          <b>Maps on this phone: {mb(used)}</b>
          {space && <>
            <progress className="ofm-bar" max={space.quota} value={Math.min(space.usage, space.quota)} aria-label="Storage used" />
            <span className="rw-sub">Apps and data use {mb(space.usage)} of {mb(space.quota)} the browser may keep.</span>
          </>}
        </div>
      </Section>
      <Section title="Settings">
        <GroupedList label="Download settings">
          <Row title="Wi-Fi only" sub="Map downloads wait when the phone says it is on mobile data" control={<Switch on={prefs.wifiOnly} label="Wi-Fi only" onChange={(on) => void putKv(KEY, { ...prefs, wifiOnly: on })} />} />
        </GroupedList>
        <p className="ofm-foot">Maps © OpenStreetMap contributors, built with Protomaps.</p>
      </Section>
    </>
  )
}
