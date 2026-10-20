import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { nearestZone } from '../location/geo'
import { OVERRIDES_KEY, telHref, type Overrides } from '../safety/entries'
import { putKv, useKv } from '../safety/store'
import { driveUrl, KINDS, kmLabel, spotsFor, splitSpots, type Kind, type Pin, type Spot } from './logic'
import './rescuemap.css'

const MapView = lazy(() => import('./MapView'))
const NONE: Overrides = {}
const LAST_KEY = 'rescuemap.last'
const ALL = new Set<Kind>(KINDS.map((k) => k.id))
const valid = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n)
const STATUS: Record<Spot['status'], string> = { CONFIRMED: 'Confirmed', LISTED: 'Listed', UNVERIFIED: 'Number not yet confirmed', FAMILY: 'Added by family', UNKNOWN: 'Not confirmed' }

function useOnline() {
  const [on, setOn] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine))
  useEffect(() => {
    const up = () => setOn(true), down = () => setOn(false)
    window.addEventListener('online', up); window.addEventListener('offline', down)
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down) }
  }, [])
  return on
}

function Badge({ s }: { s: Spot }) {
  return <span className={`rm-badge ${s.status === 'UNKNOWN' ? 'un' : 'ok'}`}>{STATUS[s.status]}</span>
}

function Actions({ s, pin }: { s: Spot; pin?: Pin }) {
  return (
    <div className="rm-act">
      {s.phone && <a className="btn" href={telHref(s.phone)}>Call {s.phone}</a>}
      {pin && <a className="btn2" href={driveUrl(pin.lat, pin.lon)} target="_blank" rel="noopener noreferrer">Go</a>}
    </div>
  )
}

/** Map of the nearest help. Position comes from the caller; the last one seen is kept so the list still works with no signal. */
export function RescueMap(props: { lat: number; lon: number; zoneName?: string }) {
  const cached = useKv<{ lat: number; lon: number } | null>(LAST_KEY, null)
  const overrides = useKv<Overrides>(OVERRIDES_KEY, NONE)
  const online = useOnline()
  const [kinds, setKinds] = useState<Set<Kind>>(ALL)
  const [pick, setPick] = useState<Pin | null>(null)
  const [focus, setFocus] = useState(0)

  const live = valid(props.lat) && valid(props.lon)
  useEffect(() => { if (live) void putKv(LAST_KEY, { lat: props.lat, lon: props.lon }).catch(() => {}) }, [live, props.lat, props.lon])
  const me = live ? { lat: props.lat, lon: props.lon } : cached && valid(cached.lat) && valid(cached.lon) ? cached : null

  const zone = me ? nearestZone(me).id : 'dampas'
  const spots = useMemo(() => spotsFor(zone, overrides), [zone, overrides])
  const { pins, unpinned } = useMemo(() => splitSpots(spots, kinds, me), [spots, kinds, me?.lat, me?.lon]) // eslint-disable-line react-hooks/exhaustive-deps
  const onPick = useCallback((p: Pin) => setPick(p), [])
  const toggle = (k: Kind) => setKinds((cur) => { const n = new Set(cur); if (!n.delete(k)) n.add(k); return n })
  const showMap = online && me !== null

  return (
    <section className="rm" aria-label="Help near you">
      {props.zoneName && <p className="rm-zone">{props.zoneName}</p>}
      <div className="rm-chips" role="group" aria-label="Show">
        {KINDS.map((k) => (
          <button key={k.id} type="button" className="rm-chip" aria-pressed={kinds.has(k.id)} onClick={() => toggle(k.id)}>{k.label}</button>
        ))}
      </div>

      {showMap ? (
        <div className="rm-mapwrap">
          <Suspense fallback={<div className="rm-map rm-wait">Loading map</div>}>
            <MapView me={me} pins={pins} onPick={onPick} focus={focus} />
          </Suspense>
          <button type="button" className="rm-recentre" onClick={() => setFocus((n) => n + 1)}>Re-centre</button>
        </div>
      ) : (
        <p className="rm-note" role="status">
          {me ? 'No signal, so the map is off. The list below still works.' : 'We do not know where you are yet. The list below still works.'}
          {!live && cached && ' Using your last known position.'}
        </p>
      )}

      {pins.length > 0 && (
        <ul className="rm-list" aria-label="Places on the map">
          {pins.map((p) => (
            <li key={p.id}>
              <button type="button" className="rm-item" onClick={() => setPick(p)}>
                <span className="grow"><b>{p.name}</b><span className="sub">{kmLabel(p.km)}</span></span>
                <Badge s={p} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {unpinned.length > 0 && (
        <>
          <p className="sec">Not on the map yet</p>
          <ul className="rm-list" aria-label="Places without a map pin">
            {unpinned.map((s) => (
              <li key={s.id} className="rm-item rm-static">
                <span className="grow"><b>{s.name}</b><span className="sub">{s.note ?? 'Ask the barangay hall.'}</span></span>
                <Badge s={s} />
                {s.phone && <a className="btn2 rm-call" href={telHref(s.phone)}>Call</a>}
              </li>
            ))}
          </ul>
        </>
      )}
      {pins.length === 0 && unpinned.length === 0 && <p className="rm-note">Nothing to show. Turn a filter on.</p>}

      {pick && (
        <div className="rm-sheet" role="dialog" aria-modal="true" aria-label={pick.name}>
          <div className="rm-sheet-in">
            <b>{pick.name}</b>
            <Badge s={pick} />
            <p className="sub">{kmLabel(pick.km)}</p>
            {pick.note && <p className="sub">{pick.note}</p>}
            <Actions s={pick} pin={pick} />
            <button type="button" className="btn2" onClick={() => setPick(null)}>Close</button>
          </div>
        </div>
      )}
    </section>
  )
}

export default RescueMap
