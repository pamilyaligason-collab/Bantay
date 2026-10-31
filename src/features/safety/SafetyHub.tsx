import hotlines from '../../data/safety/hotlines.json'
import places from '../../data/safety/places.json'
import { ALL_IDS } from '../gobag/items'
import { KEY as BAG_KEY, EMPTY as BAG_EMPTY, readState } from '../gobag/state'
import { alertRef } from '../location/place'
import type { usePlaceFrom } from '../location/useLocation'
import { HISTORY_KEY, type SosEvent } from '../sos/history'
import { rainBody, rainOutlook, skyOf, type Wx, wxLocal } from '../today/heroCards'
import { useWeather } from '../today/weather'
import { ALERTS_KEY, type Alert, affectsUs, freshness, freshText, newestChecked, quakeFeltKm, rankAlerts, type LatLon } from './alerts'
import { useNow } from './AlertCard'
import { coversHere, planDial, splitDial } from './dial'
import { type Entry, forZone, hasPoint, OVERRIDES_KEY, type Overrides, withFamilyAdded, withOverrides } from './entries'
import { hazardsFor, hazardStatus } from './hazardCards'
import { cyclones, stormName } from './LiveMaps'
import { FLAGS } from './flags'
import { CARDS } from './Practice'
import { Icon, type IconName } from '../shell/Icon'
import { Carousel, GroupedList, Row, Section, type Tint } from '../look'
import { pickLocalSet } from '../location/geo'
import { type useLocation } from '../location/useLocation'
import ZonePicker from '../location/ZonePicker'
import SosButton from '../sos/SosButton'
import SosScreen from '../sos/SosScreen'
import { ABROAD_SOURCE } from './dial'
import { StormCard } from './StormCard'
import { SafetyHead } from './SafetyHead'
import { TOPICS } from './FirstAid'
import { KEY_PHONE_CHECK } from '../phonecheck/keys'
import { type PhoneCheck, phoneAlertCount } from './stormMode'
import { useKv } from './store'
import { ddb } from '../docs/store'
import { useEffect, useState } from 'react'
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
export function rightNowRows(p: { alerts: Alert[]; here: LatLon | null; wx: Wx | null | undefined; storms: Alert[]; hazard: string; pins: number }): HomeRow[] {
  const alerts = rankAlerts(p.alerts, p.here).slice(0, 3).map((a): HomeRow => {
    const f = affectsUs(a, p.here)
    const red = (a.kind === 'tcws' && signalOf(a.level) >= 3) || a.kind === 'tsunami'
    // shortcut: "felt" wording only for quakes; other kinds say Near you / Far away
    const badge = !f.affects ? 'Far away' : a.kind === 'quake' ? (f.km === null || f.km <= quakeFeltKm(a) ? 'You may feel it' : 'Minor, far away') : 'Near you'
    return {
      href: '#safety/warnings', icon: ALERT_ICON[a.kind] ?? 'warn', tint: red ? 'red' : 'amber', title: a.title,
      sub: [a.where, f.km === null ? null : `${f.km} km`, a.source].filter(Boolean).join(' · '), badge
    }
  })
  const n = p.storms.length
  return [
    ...alerts,
    { href: '#weather', icon: 'rain', tint: 'blue', title: rainLine(p.wx), value: p.wx?.rainPct != null ? `${Math.round(p.wx.rainPct)}%` : undefined },
    { href: '#safety/storms', icon: 'typhoon', tint: n ? 'amber' : 'blue', title: 'Storm tracker', value: n ? `${stormName(p.storms[0]!)}${n > 1 ? ` and ${n - 1} more` : ''}` : 'No storms' },
    { href: '#safety/hazards', icon: 'flood', tint: 'amber', title: 'Hazards at my location', sub: p.hazard },
    { href: '#safety/map', icon: 'pin', tint: 'green', title: 'Rescue map', value: p.pins ? plural(p.pins, 'place') : 'Shelters, help' }
  ]
}

/** The "Be ready" list under the go-bag card. Offline maps shows only behind its flag, Phone alerts only while a phone setting needs fixing. */
export function readyRows(p: { dial: number; cards: number; ids: number | null; offline: boolean; sosLast: string | null; phoneFix: number }): HomeRow[] {
  const rows: HomeRow[] = [
    { href: '#safety/dial', icon: 'phone', tint: 'red', title: 'Hotlines', value: p.dial ? plural(p.dial, 'number') : 'No numbers yet' },
    { href: '#safety/cards', icon: 'file', tint: 'teal', title: 'Safety cards', value: plural(p.cards, 'guide') },
    { href: '#docs', icon: 'fp', tint: 'purple', title: 'IDs and insurance', sub: idsLine(p.ids) },
    { href: '#safety/sos', icon: 'sos', tint: 'red', title: 'Past SOS', value: p.sosLast ?? 'None sent' }
  ]
  if (p.offline) rows.push({ href: '#safety/offline', icon: 'map', tint: 'blue', title: 'Offline maps' })
  if (p.phoneFix > 0) rows.push({ href: '#safety/phonewarn', icon: 'bell', tint: 'amber', title: 'Phone alerts', value: p.phoneFix === 1 ? '1 needs fixing' : `${p.phoneFix} need fixing` })
  return rows
}

/** "CHECKED 6 MIN AGO", "NEVER CHECKED". */
export const kickerOf = (checkedAt: string | null | undefined, now: Date | number = Date.now()) => freshText(freshness(checkedAt, now)).toUpperCase()

const asRow = (r: HomeRow) => <Row key={r.title} href={r.href} icon={r.icon} tint={r.tint} title={r.title} sub={r.sub} value={r.value} badge={r.badge} badgeTint={r.tint} />

function RightNow({ place }: { place: Place }) {
  const alerts = useKv<Alert[]>(ALERTS_KEY, NONE_A)
  const overrides = useKv<Overrides>(OVERRIDES_KEY, NONE_O)
  const wx = useWeather(place.weather)
  const pins = withOverrides(forZone(places as Entry[], place.zone), overrides).filter(hasPoint).length
  const rows = rightNowRows({ alerts, here: alertRef(place), wx, storms: cyclones(alerts), hazard: hazardStatus(coversHere(place) ? hazardsFor(place.zone) : null), pins })
  return (
    <Section title="Right now" link={{ href: '#safety/sources', label: 'Sources' }}>
      <GroupedList icons label="Right now" testId="right-now">{rows.map(asRow)}</GroupedList>
    </Section>
  )
}

function BeReady({ place }: { place: Place }) {
  const overrides = useKv<Overrides>(OVERRIDES_KEY, NONE_O)
  const bag = readState(useKv<unknown>(BAG_KEY, BAG_EMPTY))
  const sosRaw = useKv<SosEvent[]>(HISTORY_KEY, NONE_S)
  const phoneFix = phoneAlertCount(useKv<PhoneCheck | null>(KEY_PHONE_CHECK, null))
  const [ids, setIds] = useState<number | null>(null)
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
      <GroupedList icons label="Be ready">{readyRows({ dial: dialCount(place, overrides), cards: CARDS.length, ids, offline: FLAGS.offlineMaps, sosLast, phoneFix }).map(asRow)}</GroupedList>
    </Section>
  )
}

const FA_QUICK: [string, IconName, string | null][] = [['stroke', 'brain', 'BE FAST'], ['cpr', 'cpr', 'Hands only'], ['choking', 'lungs', null], ['dengue-warning-signs', 'therm', 'Warning signs']]

/** The Safety home (Near me): head, SOS hero, Right now, First aid, Be ready. D-33: one place for the whole screen. */
export default function SafetyHome({ l, place }: { l: ReturnType<typeof useLocation>; place: Place | null }) {
  const [sos, setSos] = useState(false)
  const alerts = useKv<Alert[]>(ALERTS_KEY, NONE_A)
  const now = useNow()
  // 911 only works in the Philippines and the US (Texas). Elsewhere abroad point at the official list instead.
  const abroad = !!place && pickLocalSet(place.weather).where === 'abroad'
  if (sos) return <SosScreen onClose={() => setSos(false)} />
  const chip = <ZonePicker loc={l} />
  return (
    <>
      <SafetyHead view="near" kicker={kickerOf(newestChecked(alerts), now)} actions={place?.source === 'last' ? <span data-testid="place-last">{chip}</span> : chip} />
      <StormCard />
      <section className="card sf-hero" data-hero data-testid="safety-hero" aria-label="Emergency">
        <div className="sf-hero-row">
          <SosButton onSend={() => setSos(true)} />
          <div className="sf-hero-t"><b>Emergency</b><span className="sub">Calls your first family contact and texts your place. Everyone sees it in Bantay.</span></div>
        </div>
        <div className="sf-pair">
          {abroad
            ? <a href={ABROAD_SOURCE.url} target="_blank" rel="noopener noreferrer" className="btn" style={{ background: 'var(--danger-bg)' }}>Local emergency number</a>
            : <a href="tel:911" className="btn" style={{ background: 'var(--danger-bg)' }}>Call 911</a>}
          <a href="#medid" className="btn2 sf-ico"><Icon name="cross" size={20} />Medical ID</a>
        </div>
      </section>
      {place && <RightNow place={place} />}
      <Section title="First aid" link={{ href: '#safety/firstaid', label: `All ${TOPICS.length}` }}>
        <Carousel label="First aid">
          {FA_QUICK.map(([id, icon, sub]) => {
            const t = TOPICS.find((x) => x.id === id)
            if (!t) return null
            return (
              <a key={id} className="card sf-fa" href={`#safety/firstaid/${id}`}>
                <Icon name={icon} size={28} />
                <b>{t.title}</b>
                <span className="sub" lang={sub ? undefined : 'fil'}>{sub ?? t.tl}</span>
              </a>
            )
          })}
        </Carousel>
        <p className="sub sf-911">Call 911 first if someone cannot breathe, speak or wake up.</p>
      </Section>
      {place && <BeReady place={place} />}
      <p className="sub sf-foot">Bantay is not an earthquake or tsunami siren. From PAGASA, {FLAGS.phivolcs ? 'PHIVOLCS, ' : ''}USGS, GDACS, DOH and Red Cross. <a href="#safety/sources">Sources</a></p>
    </>
  )
}
