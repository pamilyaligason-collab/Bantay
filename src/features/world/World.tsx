import { useMemo, useState } from 'react'
import { ALERTS_KEY, CHECKED_KEY, NO_STALE, STALE_KEY, feedStale, outdatedLine, shownCheck, type Alert, type StaleSources } from '../safety/alerts'
import { alertRef } from '../location/place'
import { FLAGS } from '../safety/flags'
import LazyMap from '../safety/LazyMap'
import { SafetyHead } from '../safety/SafetyHead'
import { useKv } from '../safety/store'
import ZonePicker from '../location/ZonePicker'
import { useLocation, usePlaceFrom } from '../location/useLocation'
import { GroupedList, Row, Section, Segmented } from '../look'
import { readPrefs, ALERT_KEY } from './prefs'
import { pinsOf, worldRows, type PinKind, type WorldRow } from './rows'
import '../safety/safety.css'
import './world.css'

const NONE: Alert[] = []
type Filter = 'all' | 'near' | 'ph' | 'world'
const LEGEND: [PinKind, string][] = [['flood', 'Flood'], ['quake', 'Quake'], ['storm', 'Storm'], ['volcano', 'Volcano'], ['other', 'Other']]

function Rows({ rows, empty, label }: { rows: WorldRow[]; empty: string; label: string }) {
  if (!rows.length) return <p className="wd-empty">{empty}</p>
  return (
    <GroupedList label={label}>
      {rows.map((r) => <Row key={r.id} title={r.title} sub={r.sub} badge={r.badge} href={r.href} />)}
    </GroupedList>
  )
}

/** Safety, World half: a map of real alert pins, three lists, and the digest card. Feeds that do not exist yet sit behind FLAGS.worldFeeds and show empty states. */
export default function World(p: { l?: ReturnType<typeof useLocation>; place?: ReturnType<typeof usePlaceFrom> }) {
  return p.l ? <WorldView l={p.l} place={p.place ?? null} /> : <WorldOwn />
}

/** Standalone use (tests, deep links): reads its own position. SafetySub passes the one it already holds. */
function WorldOwn() {
  const l = useLocation()
  return <WorldView l={l} place={usePlaceFrom(l)} />
}

function WorldView({ l, place }: { l: ReturnType<typeof useLocation>; place: ReturnType<typeof usePlaceFrom> }) {
  const alerts = useKv<Alert[]>(ALERTS_KEY, NONE)
  const saved = useKv<unknown>(CHECKED_KEY, null)
  const down = useKv<StaleSources>(STALE_KEY, NO_STALE)
  const stale = feedStale(alerts, saved, down) // the same test as Safety: no "none" wording without a fresh check
  const NOT_SAID = 'Not checked lately, so Bantay cannot say there is none.'
  const prefs = readPrefs(useKv<unknown>(ALERT_KEY, undefined))
  const [filter, setFilter] = useState<Filter>('all')
  const here = place ? alertRef(place) : null
  const rows = useMemo(() => worldRows(alerts, here), [alerts, here?.lat, here?.lon]) // eslint-disable-line react-hooks/exhaustive-deps -- here is read by value
  const pins = useMemo(() => pinsOf(alerts), [alerts])
  const kinds = new Set(pins.map((p) => p.kind))
  const show = (f: Filter) => filter === 'all' || filter === f
  return (
    <>
      <SafetyHead view="world" actions={<ZonePicker loc={l} />} />
      {stale && <p className="sf-note" role="status">{outdatedLine(shownCheck(alerts, saved, down))}</p>}
      <LazyMap height={260} center={[12, 122]} zoom={4} label="Map of active alerts" testId="world-map" depKey={`${pins.map((p) => p.id).join()}|${here?.lat}|${here?.lon}`}
        setup={(L, map) => {
          for (const p of pins) L.circleMarker([p.lat, p.lon], { radius: 8, className: `wm wm-${p.kind}` }).bindTooltip(p.title).addTo(map)
          if (here) L.circleMarker([here.lat, here.lon], { radius: 7, className: 'lm-me' }).addTo(map)
        }} />
      <ul className="wd-legend" aria-label="Map key">
        <li><span className="wd-dot lm-you" aria-hidden="true" />You</li>
        {LEGEND.filter(([k]) => kinds.has(k)).map(([k, t]) => <li key={k}><span className={`wd-dot wd-${k}`} aria-hidden="true" />{t}</li>)}
      </ul>
      <Segmented label="Filter" value={filter} onChange={setFilter} options={[{ id: 'all', label: 'All' }, { id: 'near', label: 'Near family' }, { id: 'ph', label: 'Philippines' }, { id: 'world', label: 'World' }]} />
      {show('near') && <Section title="Near your family" meta="Instant alerts"><Rows label="Near your family" rows={rows.nearFamily} empty={stale ? NOT_SAID : 'No active hazards at Dampas or Conel'} /></Section>}
      {show('ph') && (
        <Section title="Philippines" meta="Official">
          <Rows label="Philippines" rows={rows.philippines} empty={stale ? NOT_SAID : 'No official warnings right now'} />
          {FLAGS.phivolcs && <GroupedList label="Volcanoes"><Row icon="warn" tint="amber" title="Volcano alert levels" href="#safety/warnings" /></GroupedList>}
        </Section>
      )}
      {show('world') && <Section title="World" meta="GDACS"><Rows label="World" rows={rows.world} empty={stale ? NOT_SAID : 'No big events listed by GDACS'} /></Section>}
      {FLAGS.worldFeeds && (
        <>
          <Section title="Forecasts to watch"><p className="wd-empty">No forecasts listed yet.</p></Section>
          <Section title="Macro and news"><p className="wd-empty">No macro headlines yet.</p></Section>
          <Section title="Your panels"><p className="wd-empty">You have no panels yet.</p></Section>
        </>
      )}
      <Section title="Daily digest">
        <div className="card wd-digest">
          <b>Daily digest (coming) · {prefs.digestTime}</b>
          <a href="#safety/alerts">Settings</a>
        </div>
      </Section>
      <p className="wd-foot">Summaries are short and neutral; tap for the source.</p>
    </>
  )
}
