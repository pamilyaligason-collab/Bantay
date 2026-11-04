import { useMemo, useState } from 'react'
import { Sheet } from '../look/Sheet'
import { Icon } from '../shell/Icon'
import { ALERTS_KEY, CHECKED_KEY, EONET_KEY, NO_STALE, STALE_KEY, feedStale, outdatedLine, shownCheck, type Alert, type StaleSources } from '../safety/alerts'
import { alertRef } from '../location/place'
import { FLAGS } from '../safety/flags'
import LazyMap from '../safety/LazyMap'
import { SafetyHead } from '../safety/SafetyHead'
import { putKv, useKv } from '../safety/store'
import ZonePicker from '../location/ZonePicker'
import { useLocation, usePlaceFrom } from '../location/useLocation'
import { GroupedList, Row, Section, Segmented } from '../look'
import { readPrefs, ALERT_KEY } from './prefs'
import { digestHeadline, digestShown, PANEL_KEY, PANEL_LABEL, PANELS, readPanels } from './panels'
import { forecastRows, pinsOf, visible, volcanoRows, worldRows, type PinKind, type WorldRow } from './rows'
import { newsIsOld, useWorldNews } from './useWorldNews'
import '../safety/safety.css'
import './world.css'

const NONE: Alert[] = []
type Filter = 'all' | 'near' | 'ph' | 'world'
const LEGEND: [PinKind, string][] = [['flood', 'Flood'], ['quake', 'Quake'], ['storm', 'Storm'], ['volcano', 'Volcano'], ['other', 'Other']]

/** A headline is third-party text: plain text only, opened in a new tab with no opener. */
function News({ items, old }: { items: ReturnType<typeof useWorldNews>['news']; old: boolean }) {
  return (
    <GroupedList label="Macro and news">
      {items.map((n) => (
        <div className="rw" role="listitem" key={n.id}>
          <a className="rw-main press" href={n.url} target="_blank" rel="noopener noreferrer">
            <span className="rw-lead rw-ic" data-tint="blue"><Icon name="out" size={20} /></span>
            <span className="rw-txt"><b className="rw-title">{n.title}</b><span className="rw-sub">{`${n.source ? `${n.source} · ` : ''}GDELT${old ? ' · over a day old' : ''}`}</span></span>
          </a>
        </div>
      ))}
    </GroupedList>
  )
}

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
  const official = useKv<Alert[]>(ALERTS_KEY, NONE)
  const eonetRows = useKv<Alert[]>(EONET_KEY, NONE) // lane A keeps EONET apart from the official list, and writes it only while FLAGS.eonet is on
  const alerts = useMemo(() => visible(FLAGS.eonet ? [...official, ...eonetRows] : official, FLAGS.eonet), [official, eonetRows])
  const saved = useKv<unknown>(CHECKED_KEY, null)
  const down = useKv<StaleSources>(STALE_KEY, NO_STALE)
  const stale = feedStale(official, saved, down) // the same test as Safety: no "none" wording without a fresh check
  const NOT_SAID = 'Not checked lately, so Bantay cannot say there is none.'
  const prefs = readPrefs(useKv<unknown>(ALERT_KEY, undefined))
  const [filter, setFilter] = useState<Filter>('all')
  const [managing, setManaging] = useState(false)
  const panels = readPanels(useKv<unknown>(PANEL_KEY, undefined))
  const feed = useWorldNews({ news: FLAGS.worldFeeds && panels.macro, digest: FLAGS.digest })
  const now = Date.now()
  const here = place ? alertRef(place) : null
  const rows = useMemo(() => worldRows(alerts, here), [alerts, here?.lat, here?.lon]) // eslint-disable-line react-hooks/exhaustive-deps -- here is read by value
  const pins = useMemo(() => pinsOf(alerts), [alerts])
  const forecasts = useMemo(() => forecastRows(alerts), [alerts])
  const volcanoes = useMemo(() => volcanoRows(alerts), [alerts])
  const kinds = new Set(pins.map((p) => p.kind))
  const show = (f: Filter) => filter === 'all' || filter === f
  return (
    <>
      <SafetyHead view="world" actions={<ZonePicker loc={l} />} />
      {stale && <p className="sf-note" role="status">{outdatedLine(shownCheck(official, saved, down))}</p>}
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
          {FLAGS.phivolcs && <GroupedList label="Volcano levels"><Row icon="warn" tint="amber" title="Volcano alert levels" href="#safety/warnings" /></GroupedList>}
        </Section>
      )}
      {show('world') && <Section title="World" meta={FLAGS.eonet ? 'GDACS, EONET' : 'GDACS'}><Rows label="World" rows={rows.world} empty={stale ? NOT_SAID : 'No big events listed by GDACS'} /></Section>}
      {FLAGS.worldFeeds && (
        <>
          {panels.forecasts && <Section title="Forecasts to watch"><Rows label="Forecasts to watch" rows={forecasts} empty={stale ? NOT_SAID : FLAGS.eonet ? 'No forecasts listed right now.' : 'No forecasts listed yet.'} /></Section>}
          {panels.macro && (
            <Section title="Macro and news" meta="GDELT">
              {feed.news.length ? <News items={feed.news} old={newsIsOld(feed.news, now)} />
                : <p className="wd-empty">{feed.state === 'loading' ? 'Loading headlines.' : feed.state === 'error' ? 'Could not load headlines. Try again later.' : 'No headlines yet.'}</p>}
            </Section>
          )}
          {panels.volcanoes && <Section title="Volcanoes"><Rows label="Volcano bulletins" rows={volcanoes} empty={stale ? NOT_SAID : 'No volcano bulletins listed right now.'} /></Section>}
          <Section title="Your panels"><button type="button" className="btn wd-manage" onClick={() => setManaging(true)}>Manage panels</button></Section>
        </>
      )}
      <Section title="Daily digest">
        <div className="card wd-digest">
          {FLAGS.digest && digestShown(feed.digest, prefs.digestTime, now) ? (
            <div className="wd-digest-body">
              <b>{digestHeadline(feed.digest)}</b>
              {feed.digest.top.filter((t) => FLAGS.eonet || t.kind !== 'eonet').length > 0 && <ul>{feed.digest.top.filter((t) => FLAGS.eonet || t.kind !== 'eonet').map((t) => <li key={t.id}>{t.title}{t.source ? ` · ${t.source}` : ''}</li>)}</ul>}
              {feed.digest.sources && <span className="wd-digest-src">{feed.digest.sources}</span>}
            </div>
          ) : <b>Daily digest (coming) · {prefs.digestTime}</b>}
          <a href="#safety/alerts">Settings</a>
        </div>
      </Section>
      <p className="wd-foot">Summaries are short and neutral; tap for the source.</p>
      {managing && (
        <Sheet title="Manage panels" onClose={() => setManaging(false)}>
          <div className="wp-sheet">
            <p className="wd-empty">Choose what World shows on this phone.</p>
            <div className="wp-grid">
              {PANELS.map((p) => (
                <button key={p} type="button" role="switch" aria-checked={panels[p]} className="wp-pill" onClick={() => void putKv(PANEL_KEY, { ...panels, [p]: !panels[p] })}>
                  {panels[p] && <Icon name="check" size={16} />}{PANEL_LABEL[p]}
                </button>
              ))}
            </div>
          </div>
        </Sheet>
      )}
    </>
  )
}
