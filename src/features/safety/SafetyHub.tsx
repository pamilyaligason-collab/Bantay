import hotlines from '../../data/safety/hotlines.json'
import places from '../../data/safety/places.json'
import { ALL_IDS } from '../gobag/items'
import { KEY as BAG_KEY, EMPTY as BAG_EMPTY, readState } from '../gobag/state'
import { alertRef } from '../location/place'
import type { PlaceLike } from '../location/placeWords'
import type { usePlaceFrom } from '../location/useLocation'
import { HISTORY_KEY, type SosEvent } from '../sos/history'
import { rainBody, rainOutlook, skyOf, type Wx, wxLocal } from '../today/heroCards'
import { useWeather } from '../today/weather'
import { ALERTS_KEY, CHECKED_KEY, NO_STALE, STALE_KEY, type Alert, affectsUs, allQuiet, feedStale, freshness, freshText, outdatedLine, placeOnly, quakeFeltKm, rankAlerts, shownCheck, urgentFirst, type LatLon, type StaleSources } from './alerts'
import { useNow } from './AlertCard'
import { coversHere, planDial, splitDial } from './dial'
import { type Entry, forZone, hasPoint, OVERRIDES_KEY, type Overrides, withFamilyAdded, withOverrides } from './entries'
import { hazardsFor, hazardStatus, hazardSub } from './hazardCards'
import { cyclones, stormName } from './LiveMaps'
import { FLAGS } from './flags'
import { CARDS } from './Practice'
import { Icon, type IconName } from '../shell/Icon'
import { useAutoBasemap } from './autoMaps'
import { GroupedList, Row, Section, type Tint } from '../look'
import { ForecastNote } from '../weather/ForecastNote'
import { placeNameOf } from '../today/placeName'
import { HOME_ZONES, pickLocalSet } from '../location/geo'
import { type useLocation } from '../location/useLocation'
import ZonePicker from '../location/ZonePicker'
import SosButton from '../sos/SosButton'
import SosScreen from '../sos/SosScreen'
import { ABROAD_SOURCE } from './dial'
import { StormCard } from './StormCard'
import { SafetyHead } from './SafetyHead'
import { ICON, TOPICS } from './FirstAid'
import { boardTopics, tintOf } from './FirstAidList'
import { KEY_PHONE_CHECK } from '../phonecheck/keys'
import { liveSignals, type PhoneCheck, phoneAlertCount } from './stormMode'
import { useKv } from './store'
import { basemapAt } from './OfflineMaps'
import { useStoredBasemaps } from './basemap'
import { ddb } from '../docs/store'
import { useEffect, useRef, useState } from 'react'
import './safety.css'

type Place = NonNullable<ReturnType<typeof usePlaceFrom>>
const NONE_A: Alert[] = []
const NONE_O: Overrides = {}
const NONE_S: SosEvent[] = []
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`

/** Numbers a person can call from Quick dial here: the one local set plus national, OFW and teleconsult sets that show for this place. */
export function dialCount(place: Place, overrides: Overrides): number {
  const plan = planDial(place.weather, withFamilyAdded(hotlines as Entry[], overrides), place.source !== 'zone')
  return plan.sets.reduce((n, s) => n + splitDial(s.entries).groups.reduce((m, g) => m + g.items.length, 0), 0)
}

/** Same rain numbers as Today: the hourly outlook when we have it, else the day chance. */
export function rainLine(wx: Wx | null | undefined, now: Date = new Date()): string {
  if (!wx) return 'Rain, wind and clouds'
  const sky = skyOf(wx)
  const local = wxLocal(wx, now)
  const r = wx.hourly ? rainOutlook(wx.hourly.time, wx.hourly.prob, local, sky === 'rain' || sky === 'storm') : undefined
  return rainBody(wx, r, wx.rainPct != null && wx.rainPct >= 60, local)
}

/** Saved ID and insurance cards on this phone (one per card, front and back count once), plus cards that live only in the family Drive. Null while unknown. */
export async function savedCards(): Promise<number | null> {
  try {
    const ids = new Set<string>()
    for (const c of await ddb.cards.toArray()) if (c.kind === 'id_card' || c.kind === 'insurance_card') ids.add(c.docId)
    for (const d of await ddb.driveOnly.toArray()) ids.add(d.docId)
    return ids.size
  } catch { return null }
}

export const idsLine = (n: number | null) => (n ? `${n} saved` : 'Add your PhilHealth, Senior ID, HMO')

export interface HomeRow { href: string; icon: IconName; tint: Tint; title: string; sub?: string; value?: string; badge?: string }

const ALERT_ICON: Partial<Record<Alert['kind'], IconName>> = { quake: 'quake', tcws: 'typhoon', rainfall: 'rain', thunderstorm: 'rain' }
const signalOf = (level: string | null) => Number(/(\d)/.exec(level ?? '')?.[1] ?? 0)

/** The "Right now" list: up to three ranked alerts, then weather, storms, hazards, rescue map. No "none" row: an empty list is the empty state. */
export function rightNowRows(p: { alerts: Alert[]; here: LatLon | null; place?: PlaceLike | null; wx: Wx | null | undefined; storms: Alert[]; hazard: string; pins: number; stale?: boolean }): HomeRow[] {
  const place = allQuiet(p.alerts, p.here) ? p.place : undefined // the same flag the cards use, so Far away never sits beside a worse row
  const alerts = urgentFirst(rankAlerts(p.alerts, p.here), p.here).slice(0, 3).map((a): HomeRow => {
    const f = affectsUs(a, p.here, undefined, place)
    const red = (a.kind === 'tcws' && signalOf(a.level) >= 3) || a.kind === 'tsunami'
    // shortcut: "felt" wording only for quakes; other kinds name the distance band the line already uses (Near you / Near home / Your area / In your region)
    const band = f.line.startsWith('Near you') ? 'Near you' : f.line.startsWith('Near home') ? 'Near home' : f.line.startsWith('Covers your area') ? 'Your area' : 'In your region'
    const badge = !f.affects ? 'Far away' : a.kind === 'quake' ? (f.km === null || f.km <= quakeFeltKm(a) ? 'You may feel it' : f.steps ? 'May be felt' : 'Far away') : band // the same steps flag Warnings shows, so the two screens agree
    return {
      href: '#safety/warnings', icon: ALERT_ICON[a.kind] ?? 'warn', tint: red ? 'red' : 'amber', title: a.title,
      sub: [placeOnly(a.where), f.km === null ? null : `${f.km} km`, a.source].filter(Boolean).join(' · '), badge
    }
  })
  const n = p.storms.length
  const active = p.alerts.length
  const signal = liveSignals(p.alerts)[0]
  return [
    // always first, so Warnings is reachable with zero alerts
    // the board's first row is the top alert itself (it opens Warnings); the Warnings row stays when there is no alert row, more alerts than rows, or the feed is stale
    ...(alerts.length && !p.stale && active <= alerts.length ? [] : [{ href: '#safety/warnings', icon: 'warn' as IconName, tint: (active || p.stale ? 'amber' : 'green') as Tint, title: 'Warnings', value: p.stale ? undefined : active ? `${active} now` : 'None now', badge: p.stale ? 'May be out of date' : undefined }]),
    ...alerts,
    { href: '#weather', icon: 'rain', tint: 'blue', title: 'Rain', sub: rainLine(p.wx), value: p.wx?.rainPct != null ? `Today up to ${Math.round(p.wx.rainPct)}%` : undefined },
    { href: '#safety/storms', icon: 'typhoon', tint: n || signal ? 'amber' : 'blue', title: 'Storm tracker', value: n ? `${stormName(p.storms[0]!)}${n > 1 ? ` and ${n - 1} more` : ''}` : signal ? signal.level! : p.stale ? undefined : 'No storms', badge: !n && !signal && p.stale ? 'May be out of date' : undefined },
    { href: '#safety/hazards', icon: 'flood', tint: 'amber', title: 'Hazards at my location', sub: p.hazard },
    { href: '#safety/map', icon: 'pin', tint: 'green', title: 'Rescue map', value: p.pins ? plural(p.pins, 'place') : 'Shelters, help' }
  ]
}

/** The "Be ready" list under the go-bag card. Offline maps is always listed (honest while no pack exists), Phone alerts only while a phone setting needs fixing. */
export function readyRows(p: { dial: number; cards: number; ids: number | null; offline: boolean; mapState?: 'Ready' | 'Not downloaded'; sosLast: string | null; phoneFix: number }): HomeRow[] {
  const rows: HomeRow[] = [
    { href: '#safety/dial', icon: 'phone', tint: 'red', title: 'Hotlines', value: p.dial ? plural(p.dial, 'number') : 'No numbers yet' },
    { href: '#safety/cards', icon: 'file', tint: 'teal', title: 'Safety cards', value: plural(p.cards, 'guide') },
    { href: '#docs', icon: 'id', tint: 'purple', title: 'IDs and insurance', sub: idsLine(p.ids) },
    // no map pack exists yet, so the board's "Bohol ready" would be fake: say so honestly
    { href: '#safety/offline', icon: 'dl', tint: 'teal', title: 'Offline maps', value: p.offline ? p.mapState : 'Not ready yet' },
    { href: '#safety/sos', icon: 'sos', tint: 'red', title: 'Past SOS', value: p.sosLast ?? 'None sent' }
  ]
  if (p.phoneFix > 0) rows.push({ href: '#safety/phonewarn', icon: 'bell', tint: 'amber', title: 'Phone alerts', value: p.phoneFix === 1 ? '1 needs fixing' : `${p.phoneFix} need fixing` })
  return rows
}

/** "Checked 6 min ago", "Never checked" (the head CSS upper-cases it). */
export const kickerOf = (checkedAt: string | null | undefined, now: Date | number = Date.now()) => freshText(freshness(checkedAt, now))

const asRow = (r: HomeRow) => <Row key={r.title} href={r.href} icon={r.icon} tint={r.tint} title={r.title} sub={r.sub} value={r.value} badge={r.badge} badgeTint={r.tint} />

/** The Hazards row line (W4): the reading for where you are, else the home zone's with both places named. */
const hazardLine = (place: Place) => {
  const home = hazardsFor(place.zone)
  const word = (v: ReturnType<typeof hazardsFor>) => ({ label: 'status', value: v ? hazardStatus(v) : null })
  return hazardSub(coversHere(place) ? word(home) : null, home ? { zone: (HOME_ZONES.find((z) => z.id === place.zone)?.name ?? place.zone).split(',')[0]!, reading: word(home) } : null)
}

function RightNow({ place }: { place: Place }) {
  const alerts = useKv<Alert[]>(ALERTS_KEY, NONE_A)
  const overrides = useKv<Overrides>(OVERRIDES_KEY, NONE_O)
  const savedCheck = useKv<unknown>(CHECKED_KEY, null)
  const down = useKv<StaleSources>(STALE_KEY, NO_STALE)
  const wx = useWeather(place.weather)
  const pins = withOverrides(forZone(places as Entry[], place.zone), overrides).filter(hasPoint).length
  const rows = rightNowRows({ alerts, here: alertRef(place), place, wx, storms: cyclones(alerts), hazard: hazardLine(place), pins, stale: feedStale(alerts, savedCheck, down) })
  return (
    <Section title="Right now" link={{ href: '#safety/sources', label: 'Sources' }}>
      <GroupedList icons label="Right now" testId="right-now">{rows.map(asRow)}</GroupedList>
      {wx && wx.temp != null && <p className="sf-wxnote"><ForecastNote place={placeNameOf(place)} /></p>}
    </Section>
  )
}

function BeReady({ place }: { place: Place }) {
  const overrides = useKv<Overrides>(OVERRIDES_KEY, NONE_O)
  const bag = readState(useKv<unknown>(BAG_KEY, BAG_EMPTY))
  const sosRaw = useKv<SosEvent[]>(HISTORY_KEY, NONE_S)
  const phoneFix = phoneAlertCount(useKv<PhoneCheck | null>(KEY_PHONE_CHECK, null))
  const [ids, setIds] = useState<number | null>(null)
  const storedMaps = useStoredBasemaps()
  useAutoBasemap(place.weather.lat, place.weather.lon)
  const mapState = FLAGS.offlineMaps ? (basemapAt(storedMaps, place.weather.lat, place.weather.lon) ? 'Ready' : 'Not downloaded') : undefined
  useEffect(() => { let on = true; void savedCards().then((v) => { if (on) setIds(v) }); return () => { on = false } }, [])
  const sos = Array.isArray(sosRaw) ? sosRaw.filter((e) => e && Number.isFinite(e.at)) : []
  const sosLast = sos[0] ? new Date(sos[0].at).toLocaleDateString('en-PH', { day: 'numeric', month: 'short' }) : null
  const done = bag.done.length
  const total = ALL_IDS.length
  return (
    <Section title="Be ready">
      <a className="card sf-bag" href="#gobag">
        <span className="sf-bag-t"><b>Go-bag</b><span className="sub">{done} of {total} packed</span></span>
        <span className="sf-bag-a">{done === 0 ? 'Start packing' : done < total ? 'Keep packing' : 'Packed'}</span>
        <progress className="sf-bar" max={total} value={done} aria-label={`${done} of ${total} packed`} />
      </a>
      <GroupedList icons label="Be ready">{readyRows({ dial: dialCount(place, overrides), cards: CARDS.length, ids, offline: FLAGS.offlineMaps, mapState, sosLast, phoneFix }).map(asRow)}</GroupedList>
    </Section>
  )
}

// id, icon, short title, sub (null = the topic's Filipino word), tint as on the board
const FA_QUICK: [string, IconName, string, string | null, 'red' | 'amber' | 'purple'][] = [['stroke', 'brain', 'Stroke', 'BE FAST', 'red'], ['cpr', 'cpr', 'CPR', 'Hands only', 'red'], ['choking', 'lungs', 'Choking', null, 'amber'], ['dengue-warning-signs', 'therm', 'Dengue', 'Warning signs', 'purple']]

/** First aid on the Safety home: 3 rows of 2 cards (the 4 quick ones, Stroke first by D-128, then the next topics), the rest behind Show more. */
const FA_ROWS = 3
export function FirstAidGrid() {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const quick = FA_QUICK.map(([id, icon, name, sub, tint]) => ({ id, icon, name, sub, tint, tl: TOPICS.find((x) => x.id === id)?.tl })).filter((c) => c.tl)
  const rest = boardTopics().filter((t) => !FA_QUICK.some((q) => q[0] === t.id)).map((t) => ({ id: t.id, icon: (ICON[t.id] ?? 'aid') as IconName, name: t.title, sub: null, tint: tintOf(t.id) as string | undefined, tl: t.tl })) // the All topics order and tints
  const all = [...quick, ...rest]
  const shown = open ? all : all.slice(0, FA_ROWS * 2)
  const toggle = () => {
    if (open) { // Show less: bring the section top back if collapsing left it above the screen
      const sec = box.current?.closest('section')
      requestAnimationFrame(() => { if (sec && sec.getBoundingClientRect().top < 0) sec.scrollIntoView({ block: 'start' }) })
    }
    setOpen(!open)
  }
  return (
    <div ref={box}>
      <ul className="sf-fagrid" aria-label="First aid">
        {shown.map((c) => (
          <li key={c.id}>
            <a className="card sf-fa" data-tint={c.tint} href={`#safety/firstaid/${c.id}`}>
              <Icon name={c.icon} size={28} />
              <b>{c.name}</b>
              {!c.name.toLowerCase().includes((c.sub ?? c.tl ?? '').toLowerCase()) && <span className="sub" lang={c.sub ? undefined : 'fil'}>{c.sub ?? c.tl}</span>}
            </a>
          </li>
        ))}
      </ul>
      {all.length > shown.length || open ? <button type="button" className="sf-more" aria-expanded={open} onClick={toggle}>{open ? 'Show less' : 'Show more'}</button> : null}
    </div>
  )
}

/** The Safety home (Near me): head, SOS hero, Right now, First aid, Be ready. D-33: one place for the whole screen. */
export default function SafetyHome({ l, place }: { l: ReturnType<typeof useLocation>; place: Place | null }) {
  const [sos, setSos] = useState(false)
  const alerts = useKv<Alert[]>(ALERTS_KEY, NONE_A)
  const now = useNow()
  const savedCheck = useKv<unknown>(CHECKED_KEY, null)
  const down = useKv<StaleSources>(STALE_KEY, NO_STALE)
  const checked = shownCheck(alerts, savedCheck, down)
  // 911 only works in the Philippines and the US (Texas). Elsewhere abroad point at the official list instead.
  const abroad = !!place && pickLocalSet(place.weather).where === 'abroad'
  if (sos) return <SosScreen onClose={() => setSos(false)} />
  const chip = <ZonePicker loc={l} />
  const stale = feedStale(alerts, savedCheck, down, now)
  return (
    <>
      <SafetyHead view="near" kicker={kickerOf(checked, now)} actions={chip} />
      {stale && <p className="sf-note" role="status">{outdatedLine(checked)}</p>}
      <StormCard />
      <section className="card sf-hero" data-hero data-testid="safety-hero" aria-label="Emergency">
        <div className="sf-hero-row">
          <SosButton onSend={() => setSos(true)} />
          <div className="sf-hero-t"><b>Emergency</b><span className="sub">Calls your first family contact and texts your place.</span></div>
        </div>
        <div className="sf-pair">
          {abroad
            ? <a href={ABROAD_SOURCE.url} target="_blank" rel="noopener noreferrer" className="btn2 sf-ico sf-emerg">Local emergency number</a>
            : <a href="tel:911" className="btn2 sf-ico sf-emerg"><Icon name="phone" size={20} />Call 911</a>}
          <a href="#medid" className="btn2 sf-ico"><Icon name="cross" size={20} />Medical ID</a>
        </div>
      </section>
      {place && <RightNow place={place} />}
      <Section title="First aid" link={{ href: '#safety/firstaid', label: `All ${TOPICS.length}` }}>
        <FirstAidGrid />
        <p className="sub sf-911">{abroad ? 'Call the local emergency number first' : 'Call 911 first'} if someone cannot breathe, speak or wake up.</p>
      </Section>
      {place && <BeReady place={place} />}
      <p className="sub sf-foot">Bantay is not an earthquake or tsunami siren. From PAGASA, {FLAGS.phivolcs ? 'PHIVOLCS, ' : ''}USGS, GDACS, DOH and Red Cross.</p>
    </>
  )
}
