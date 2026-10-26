import { Group } from './Group'
import hotlines from '../../data/safety/hotlines.json'
import places from '../../data/safety/places.json'
import { ALL_IDS } from '../gobag/items'
import { KEY as BAG_KEY, EMPTY as BAG_EMPTY, readState } from '../gobag/state'
import { alertRef } from '../location/place'
import type { usePlaceFrom } from '../location/useLocation'
import { HISTORY_KEY, type SosEvent } from '../sos/history'
import { rainBody, rainOutlook, skyOf, type Wx, wxLocal } from '../today/heroCards'
import { useWeather } from '../today/weather'
import { ALERTS_KEY, type Alert, rankAlerts } from './alerts'
import { coversHere, planDial, splitDial } from './dial'
import { type Entry, forZone, hasPoint, OVERRIDES_KEY, type Overrides, withFamilyAdded, withOverrides } from './entries'
import { hazardsFor, hazardStatus } from './hazardCards'
import { cyclones, stormName } from './LiveMaps'
import { CARDS } from './Practice'
import { Icon, type IconName } from '../shell/Icon'
import { useKv } from './store'
import { ddb } from '../docs/store'
import { useEffect, useState } from 'react'
import './safety.css'

type Place = NonNullable<ReturnType<typeof usePlaceFrom>>
const NONE_A: Alert[] = []
const NONE_O: Overrides = {}
const NONE_S: SosEvent[] = []
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`

// Tile icon per topic, all safety tone.
const ICONS: Record<string, IconName> = { warn: 'warn', weather: 'rain', storm: 'typhoon', map: 'pin', dial: 'phone', hazard: 'flood', bag: 'bag', cards: 'file', ids: 'fp', sos: 'sos' }

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

/** Full-width row under Call 911 and Medical ID. */
export function IdsRow() {
  const [n, setN] = useState<number | null>(null)
  useEffect(() => { let on = true; void savedCards().then((v) => { if (on) setN(v) }); return () => { on = false } }, [])
  return (
    <a href="#docs" className="sf-ids">
      <Icon name={ICONS.ids as IconName} tone="safety" boxed size={24} />
      <span className="sf-ids-t"><b>IDs and insurance</b><span>{idsLine(n)}</span></span>
      <Icon name="chev" size={20} />
    </a>
  )
}

/** Calm hub: nine big tiles, each with one live status line. Every number comes from data already on the phone. */
export default function SafetyHub({ place }: { place: Place }) {
  const alerts = useKv<Alert[]>(ALERTS_KEY, NONE_A)
  const overrides = useKv<Overrides>(OVERRIDES_KEY, NONE_O)
  const bag = readState(useKv<unknown>(BAG_KEY, BAG_EMPTY))
  const sosRaw = useKv<SosEvent[]>(HISTORY_KEY, NONE_S)
  const wx = useWeather(place.weather)

  const warns = rankAlerts(alerts, alertRef(place)).length
  const storms = cyclones(alerts)
  const confirmed = dialCount(place, overrides)
  const pins = withOverrides(forZone(places as Entry[], place.zone), overrides).filter(hasPoint).length
  const sos = Array.isArray(sosRaw) ? sosRaw.filter((e) => e && Number.isFinite(e.at)) : []
  const last = sos[0] ? new Date(sos[0].at).toLocaleDateString('en-PH', { day: 'numeric', month: 'short' }) : null

  const tiles: [string, string, string, string][] = [
    ['#safety/warnings', 'warn', 'Warnings', warns ? plural(warns, 'warning') + ' now' : 'None now'],
    ['#weather', 'weather', 'Weather', rainLine(wx)],
    ['#safety/storms', 'storm', 'Storm tracker', storms.length ? `${stormName(storms[0]!)}${storms.length > 1 ? ` and ${storms.length - 1} more` : ''}` : 'No storms now'],
    ['#safety/map', 'map', 'Rescue map', pins ? plural(pins, 'place') + ' on the map' : 'Shelters and help'],
    ['#safety/dial', 'dial', 'Quick dial', confirmed ? `${plural(confirmed, 'number')} ready` : 'No numbers yet'],
    ['#safety/hazards', 'hazard', 'Hazards at my location', hazardStatus(coversHere(place) ? hazardsFor(place.zone) : null)],
    ['#gobag', 'bag', 'Go-bag', `${bag.done.length} of ${ALL_IDS.length} packed`],
    ['#safety/cards', 'cards', 'Safety cards', `${CARDS.length} how-to guides`],
    ['#safety/sos', 'sos', 'Past SOS', last ? `Last one ${last}` : 'None sent']
  ]
  const link = ([href, icon, title, status]: [string, string, string, string]) => (
    <a key={href} href={href} className="sf-tile">
      <Icon name={ICONS[icon] ?? 'shield'} tone="safety" boxed size={24} />
      <span className="sf-tile-t">{title}</span>
      <span className="sf-tile-s">{status}</span>
    </a>
  )
  const by = (hrefs: string[]) => tiles.filter((t) => hrefs.includes(t[0])).map(link)
  return (
    <>
      <Group id="sf-g-alerts" tone="alerts" title="Alerts and official sources" sub="Live warnings, weather and maps from PAGASA, PHIVOLCS and NDRRMC.">
        <nav className="sf-tiles" aria-label="Safety topics: alerts">{by(['#safety/warnings', '#weather', '#safety/storms', '#safety/map', '#safety/hazards'])}</nav>
      </Group>
      <Group id="sf-g-hot" tone="hotlines" title="Hotlines" sub="Numbers to call, and what you sent before.">
        <nav className="sf-tiles" aria-label="Safety topics: hotlines">{by(['#safety/dial', '#safety/sos'])}</nav>
      </Group>
      <Group id="sf-g-ready" tone="ready" title="Be ready" sub="Prepare before something happens.">
        <nav className="sf-tiles" aria-label="Safety topics: be ready">{by(['#gobag', '#safety/cards'])}</nav>
      </Group>
    </>
  )
}
