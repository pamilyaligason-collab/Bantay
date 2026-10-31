import { useState } from 'react'
import places from '../../data/safety/places.json'
import { HOME_ZONES } from '../location/geo'
import { GroupedList, Row, Section, Segmented, type Tint } from '../look'
import { Icon, type IconName } from '../shell/Icon'
import { spotsFor } from '../rescuemap/logic'
import { coversHere } from './dial'
import { type Entry, OVERRIDES_KEY, type Overrides } from './entries'
import { hazardLabel, hazardsFor, hazardStatus, type HazardCard, type Tone } from './hazardCards'
import { LAYERS, layerState, NOAH_URL, readDate, type LayerId } from './hazardsLayers'
import LazyMap from './LazyMap'
import type { Place } from './SafetyPages'
import { useKv } from './store'
import './safety.css'
import './hazards.css'

const NONE_O: Overrides = {}
const ICON: Record<string, IconName> = { quake: 'quake', flood: 'flood', landslide: 'warn', surge: 'typhoon' }
const BADGE: Record<Tone, Tint> = { good: 'green', warn: 'amber', none: 'none' }
const HHPH = 'https://hazardhunter.georisk.gov.ph/'

function Ext({ title, sub, url }: { title: string; sub: string; url: string }) {
  return (
    <div className="rw" role="listitem">
      <a className="rw-main press" href={url} target="_blank" rel="noopener noreferrer">
        <span className="rw-lead rw-ic" data-tint="blue"><Icon name="out" size={20} /></span>
        <span className="rw-txt"><b className="rw-title">{title}</b><span className="rw-sub">{sub}</span></span>
      </a>
    </div>
  )
}

const cardRow = (c: HazardCard) => (
  <Row key={c.id} icon={ICON[c.id]} tint={c.tone === 'warn' ? 'red' : c.tone === 'good' ? 'green' : 'none'} title={c.title} sub={c.id === 'quake' ? c.todo : c.readings[0]?.value ?? 'Not confirmed yet'} badge={hazardLabel(c)} badgeTint={BADGE[c.tone]} />
)

export default function HazardPage({ place }: { place: Place }) {
  const [layer, setLayer] = useState<LayerId>('flood')
  const overrides = useKv<Overrides>(OVERRIDES_KEY, NONE_O)
  const v = coversHere(place) ? hazardsFor(place.zone) : null
  const zone = HOME_ZONES.find((z) => z.id === place.zone) ?? HOME_ZONES[0]
  const sources = (
    <Section title="Source">
      <GroupedList icons label="Source">
        <Ext title="Open HazardHunterPH" sub={v ? `Read ${readDate(v.source) ?? 'recently'} · ${zone.name.split(',')[0]} only` : 'Check your exact street'} url={v?.url ?? HHPH} />
        <Ext title="Open in NOAH" sub="UP Resilience Institute" url={NOAH_URL} />
      </GroupedList>
    </Section>
  )
  if (!v) return (
    <div className="hz">
      <p className="sf-empty" role="status">No hazard readings for {place.source === 'zone' ? 'this zone' : 'where you are'} yet. Check HazardHunterPH or NOAH for your street.</p>
      {sources}
    </div>
  )
  const ls = layerState(layer, v)
  const quake = v.cards.find((c) => c.id === 'quake')!
  const help = spotsFor(place.zone, overrides, places as Entry[]).find((s) => s.kind === 'health')
  const status = hazardStatus(v)
  const bad = v.cards.some((c) => c.tone === 'warn')
  return (
    <div className="hz">
      <Section title="This place" meta="HAZARDHUNTERPH">
        <div className="card hz-zone" data-testid="hazards-zone">
          <div className="hz-zone-top">
            <span className="rw-lead rw-ic" data-tint="red"><Icon name="pin" size={24} /></span>
            <div className="rw-txt"><b className="hz-name">{zone.name}</b><span className="rw-sub">Home zone · {zone.name.split(', ')[1] ?? 'Philippines'}</span></div>
          </div>
          <p className="hz-status" data-tone={bad ? 'warn' : 'good'}>{status}.</p>
        </div>
      </Section>
      <Segmented label="Hazard layer" value={layer} onChange={setLayer} options={LAYERS.map((l) => ({ id: l.id, label: l.label }))} />
      <LazyMap height={180} center={[place.weather.lat, place.weather.lon]} zoom={13} depKey={`hz|${place.weather.lat}|${place.weather.lon}`} label="Map of your place" testId="hazards-map"
        setup={(L, m) => { L.circleMarker([place.weather.lat, place.weather.lon], { radius: 8, className: 'lm-zone', interactive: false }).addTo(m) }} />
      <p className="hz-cap" data-testid="layer-caption"><span>{ls.text}</span>{ls.reading !== null && <b className="rw-badge" data-tint={BADGE[ls.tone]}>{ls.reading}</b>}</p>
      <Section title="Ground and shaking">
        <GroupedList icons label="Ground and shaking">
          {cardRow(quake)}
          {quake.readings[1] && <Row icon="warn" tint={quake.readings[1].value ? 'green' : 'none'} title="Liquefaction, tsunami, ground rupture" value={quake.readings[1].value ?? 'Not confirmed yet'} />}
          {v.cards.filter((c) => c.id !== 'quake').map(cardRow)}
          {v.rest.map((r) => <Row key={r.label} icon="map" tint="none" title={r.label} sub={r.value ?? 'Not confirmed yet'} />)}
        </GroupedList>
      </Section>
      {help && (
        <Section title="Closest help">
          <div className="card hz-help">
            <div className="rw-txt"><b className="hz-name">{help.name}</b>{help.note && <span className="rw-sub">{help.note}</span>}</div>
            <a className="btn2" href="#safety/map">See on Rescue map</a>
          </div>
        </Section>
      )}
      <Section title="What to do">
        <GroupedList icons label="What to do">
          <Row icon="quake" tint="amber" title="Earthquake" href="#safety/cards" />
          <Row icon="flood" tint="blue" title="Flood" href="#safety/cards" />
          <Row icon="typhoon" tint="teal" title="Tsunami" href="#safety/cards" />
        </GroupedList>
      </Section>
      {sources}
      <p className="hz-foot">Hazard maps show where harm is possible. They do not predict when.</p>
    </div>
  )
}
