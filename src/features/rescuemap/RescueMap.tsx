import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { nearestZone } from '../location/geo'
import { googleGo, OVERRIDES_KEY, telHref, type Overrides } from '../safety/entries'
import { putKv, useKv } from '../safety/store'
import { KINDS, kmLabel, sourceLine, spotsFor, splitSpots, type Kind, type Pin, type Spot } from './logic'
import './rescuemap.css'
import { Icon } from '../shell/Icon'
import { Section, Sheet } from '../look'

const MapView = lazy(() => import('./MapView'))
const NONE: Overrides = {}
const LAST_KEY = 'rescuemap.last'
const ALL = new Set<Kind>(KINDS.map((k) => k.id))
const valid = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n)

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
  const ok = s.status === 'CONFIRMED'
  return <span className={`rm-badge ${ok ? 'ok' : 'un'}`}>{ok ? 'Confirmed by barangay' : 'Not confirmed'}</span>
}

function Actions({ s, pin }: { s: Spot; pin?: Pin }) {
  if (!pin && !s.phone) return null
  return (
    <div className="rm-act">
      {pin && <a className="btn" href={googleGo(pin.lat, pin.lon)} target="_blank" rel="noopener noreferrer">Directions</a>}
      {s.phone && <a className="btn2" href={telHref(s.phone)}>Call<span className="lv-sr"> {s.phone}</span></a>}
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
          <button key={k.id} type="button" className="rm-chip" aria-pressed={kinds.has(k.id)} onClick={() => toggle(k.id)}>{kinds.has(k.id) && <Icon name="check" size={18} />}{k.label}</button>
        ))}
      </div>

      <div className="card mapc rm-mapc">
        {showMap ? (
          <div className="rm-mapwrap">
            <Suspense fallback={<div className="rm-map rm-wait">Loading map</div>}>
              <MapView me={me} pins={pins} onPick={onPick} focus={focus} />
            </Suspense>
            <button type="button" className="mapc-re" aria-label="Centre on my location" onClick={() => setFocus((n) => n + 1)}><Icon name="send" size={20} /></button>
          </div>
        ) : (
          <p className="rm-note" role="status">
            {me ? 'No signal, so the map is off. The list below still works.' : 'We do not know where you are yet. The list below still works.'}
            {!live && cached && ' Using your last known position.'}
          </p>
        )}
        <p className="mapc-credit">© OpenStreetMap contributors</p>
      </div>

      <Section title="Nearest help" meta="From your location">
        {pins.length > 0 && (
          <ul className="rm-list" aria-label="Places on the map">
            {pins.map((p, i) => (
              <li key={p.id} className="rm-li">
                <button type="button" className="rm-item" onClick={() => setPick(p)}>
                  <span className="rm-n" aria-hidden="true">{i + 1}</span>
                  <span className="grow"><b>{p.name}</b><span className="sub">{kmLabel(p.km)}</span><Badge s={p} /><span className="sub">{sourceLine(p)}</span></span>
                </button>
                <Actions s={p} pin={p} />
              </li>
            ))}
          </ul>
        )}
        {unpinned.length > 0 && (
          <ul className="rm-list" aria-label="Places without a map pin">
            {unpinned.map((s) => (
              <li key={s.id} className="rm-li">
                <div className="rm-item rm-static">
                  <span className="grow"><b>{s.name}</b><span className="sub">{s.note ?? 'Ask the barangay hall.'}</span><Badge s={s} /><span className="sub">{sourceLine(s)}</span></span>
                </div>
                <Actions s={s} />
              </li>
            ))}
          </ul>
        )}
        {pins.length === 0 && unpinned.length === 0 && <p className="rm-note">Nothing to show. Turn a filter on.</p>}
      </Section>

      <details className="card rm-safe">
        <summary>Likely safe places</summary>
        <p>Not official: schools, covered courts, barangay hall. Ask your barangay which centre is official.</p>
      </details>
      <a className="card rm-link" href="#safety/dial">Hotlines</a>
      <p className="sub rm-foot">No current national list of evacuation centres exists. Bantay lists what families and barangays confirm. Call 911 first.</p>

      {pick && (
        <Sheet title={pick.name} onClose={() => setPick(null)}>
          <Badge s={pick} />
          <p className="sub">{kmLabel(pick.km)}</p>
          {pick.note && <p className="sub">{pick.note}</p>}
          <p className="sub">{sourceLine(pick)}</p>
          <Actions s={pick} pin={pick} />
        </Sheet>
      )}
    </section>
  )
}

export default RescueMap
