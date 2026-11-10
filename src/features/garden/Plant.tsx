import { useState } from 'react'
import { Section } from '../look'
import { SubHeader } from '../shell/SubHeader'
import type { ClimateType } from '../../data/provinceClimate'
import { CLIMATE_TYPES, cropsFor, MONTH_NAMES, useClimate, useMonth } from './climate'
import { priceDay, priceFor, priceText, useDaPrices, type DaPrices, type DaRow } from './daPrices'
import { dryWhen, isStale, manilaYm, monthName, useDrought } from './drought'
import { guideFor, LICENCE_URL, VEG_GUIDE, type VegGuide } from './vegGuide'
import './garden.css'

export const PLANT_FOOTER = 'General guide from the planting calendar of PCARRD, now PCAARRD (bulletin 200, 2000), with data from the Bureau of Plant Industry.'
export const PRICE_NOTE = 'Prices are Metro Manila; local prices may differ.'
/** The climate type in plain words for the sub-line (the four types are in CLIMATE_TYPES). */
const TYPE_WORD: Record<ClimateType, string> = { 1: 'Dry and wet seasons', 2: 'No dry season', 3: 'No clear season', 4: 'Rain all year' }
/** " · No dry season" for the sub-line, left out when the province's PAGASA outlook shows a dry spell or drought ahead, so it never contradicts the Climate outlook card above (S29 A4). */
const typeWord = (t: ClimateType, dry: boolean) => (dry ? '' : ` · ${TYPE_WORD[t]}`)
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)

/** Crops in the calendar that cope with less water. A short list, general agronomy, not DA or PCAARRD data; sources: FAO crop information pages and ECHO technical notes for cowpea (which includes
 *  yardlong bean, Vigna unguiculata), pigeon pea, hyacinth bean (lablab), lima bean and okra; FAO crop water notes for watermelon (deep roots). Extend only from a named source. */
export const DROUGHT_TOLERANT = ['Cowpea', 'Yardlong bean', 'Pigeon pea', 'Hyacinth bean', 'Lima bean', 'Okra', 'Watermelon']
const tolerantFirst = <T,>(xs: T[], name: (x: T) => string): T[] => [...xs.filter((x) => DROUGHT_TOLERANT.includes(name(x))), ...xs.filter((x) => !DROUGHT_TOLERANT.includes(name(x)))]
const tolerant = (n: string) => DROUGHT_TOLERANT.includes(n)
const names2 = (xs: string[]) => (xs.length > 1 ? `${xs[0]} and ${xs[1]} need` : `${xs[0]} needs`)
/** The dry period PAGASA's outlook gives for the province: `now` when its first dry month is this month. */
export interface Dry { province: string; ym: string; level: 'dry_spell' | 'drought'; now: boolean }
const kind = (d: Dry) => (d.level === 'drought' ? 'drought' : 'dry spell')
/** The timing lead: "Bohol is in a dry spell." or "A dry spell is coming to Bohol in January." */
export const dryLead = (d: Dry) => (d.now ? `${d.province} is in a ${kind(d)}.` : `${d.level === 'drought' ? 'A drought may come' : 'A dry spell is coming'} to ${d.province} in ${monthName(d.ym)}.`)
export const dryNote = (d: Dry, crops: string[]) => `${dryLead(d)} ${names2(crops.slice(0, 2))} less water.`
export const dryTip = (d: Dry) => `${dryLead(d)} Water early in the morning and mulch to keep the soil damp.`
type Tile = { g: VegGuide } | { name: string }
const tileName = (t: Tile) => ('g' in t ? t.g.calendar : t.name)
const shownName = (t: Tile) => ('g' in t ? t.g.name : t.name)
/** Today's tiles: the plantList order (in a dry spell, crops that cope with less water lead inside each group), so guided crops with a photo come before "Guide coming" ones. */
export function plantTiles(guided: VegGuide[], others: { name: string }[], n = 3): Tile[] {
  return [...guided.map((g): Tile => ({ g })), ...others.map((o): Tile => ({ name: o.name }))].slice(0, n)
}
/** The dry-spell line for the tiles on screen: names only the tolerant ones shown (max 2), else a watering tip. */
export const dryText = (d: Dry, shown: Tile[]) => {
  const t = shown.filter((x) => tolerant(tileName(x))).map(shownName)
  return t.length ? dryNote(d, t) : dryTip(d)
}

/** Crops in the bulletin for this type and month: the ones with a written guide first (poster order), then the rest. `dry`: crops that cope with less water go first in each group. */
export function plantList(type: ClimateType, month: number, dry = false): { guided: VegGuide[]; others: { name: string; tagalog: string | null }[] } {
  const crops = cropsFor(type, month)
  const names = new Set(crops.map((c) => c.name))
  const guided = VEG_GUIDE.filter((g) => names.has(g.calendar)), others = crops.filter((c) => !guideFor(c.name))
  return dry ? { guided: tolerantFirst(guided, (g) => g.calendar), others: tolerantFirst(others, (o) => o.name) } : { guided, others }
}
/** The first dry month in this province's PAGASA outlook among the months the Climate card shows (null = none, or no current outlook). */
function useDry(province: string | null | undefined): Dry | null {
  const d = useDrought(province ?? null)
  const nowYm = manilaYm()
  const w = province && d && !isStale(d.issued_at) ? dryWhen(d.months, nowYm) : null
  return province && w ? { province, ym: w.ym, level: w.level, now: w.ym === nowYm } : null
}
const priceOf = (g: VegGuide, d: DaPrices | null | undefined): DaRow | null => (d ? priceFor(d.rows, g.price) : null)

/** The "Pick your area's climate type" choice (types 1-4, one line each). The pick is saved on the phone. */
export function ClimatePicker({ current, onPick }: { current?: ClimateType | null; onPick: (t: ClimateType) => void }) {
  return (
    <fieldset className="gpl-pick" data-testid="climate-picker">
      <legend>Pick your area's climate type</legend>
      {CLIMATE_TYPES.map((c) => (
        <button key={c.type} type="button" className="gpl-type" aria-pressed={current === c.type} onClick={() => onPick(c.type)}>
          <b>Type {c.type}</b><span>{c.line}</span>
        </button>
      ))}
    </fieldset>
  )
}

/** S26 (D-165): "Plant this month" on Today: three photo tiles with the DA price, opening the poster page. Without a climate type it asks first. */
export function PlantCard() {
  const c = useClimate()
  const d = useDaPrices()
  const month = useMonth()
  const dryIn = useDry(c.province)
  if (!c.ready) return null
  if (!c.type) return <Section title="Plant this month" testId="today-plant"><div className="card gpl-card"><ClimatePicker onPick={c.pick} /></div></Section>
  const { guided, others } = plantList(c.type, month, !!dryIn)
  const tiles = plantTiles(guided, others)
  const total = guided.length + others.length
  if (!tiles.length) return null
  const first = tiles.find((t): t is { g: VegGuide } => 'g' in t)?.g
  const anyPrice = tiles.some((t) => 'g' in t && priceOf(t.g, d))
  return (
    <Section title="Plant this month" link={{ href: '#garden/plant', label: total > 3 ? `See all ${total}` : 'See more' }} testId="today-plant">
      <a className="card gpl-card" href="#garden/plant" data-testid="plant-card">
        <span className="gpl-sub">{MONTH_NAMES[month - 1]}{typeWord(c.type, !!dryIn)}{c.guess && !dryIn ? ' (from your province)' : ''}{anyPrice ? ' · DA prices, Metro Manila' : ''}</span>
        {dryIn && <span className="gpl-dry" data-testid="plant-dry">{dryText(dryIn, tiles)}</span>}
        <span className="gpl-tiles">
          {tiles.map((t) => 'g' in t ? (
            <span key={t.g.name} className="gpl-tile"><img src={t.g.img} alt={t.g.alt} loading="lazy" /><span className="gpl-tn" data-contrast-bg="#0A190F">{t.g.name}{priceOf(t.g, d) && <small>{priceText(priceOf(t.g, d)!)}</small>}</span></span>
          ) : (
            <span key={t.name} className="gpl-tile gpl-tile--bare"><span className="gpl-tn">{t.name}<small>Guide coming</small></span></span>
          ))}
        </span>
        <span className="gpl-line">{first ? <><b>{first.name}</b>: first harvest in {lower(first.harvest)}. Tap for variety, land prep and price.</> : <>Tap to see what to plant in {MONTH_NAMES[month - 1]}.</>}</span>
        {!!first && <span className="gpl-photos" data-testid="plant-photos">Photos: Wikimedia Commons, see credits</span>}
      </a>
    </Section>
  )
}

function Poster({ g, price, date, hero }: { g: VegGuide; price: DaRow | null; date: string | null; hero: boolean }) {
  return (
    <article className={hero ? 'gpl-poster gpl-hero' : 'gpl-poster'} data-testid={`poster-${g.calendar}`}>
      <div className="gpl-pic">
        <img src={g.img} alt={g.alt} loading={hero ? 'eager' : 'lazy'} />
        {price && <span className="gpl-price"><b>{priceText(price)}</b><span>{date ? `DA, ${priceDay(date)}` : 'DA'}</span></span>}
        <div className="gpl-cap"><h2>{g.name}</h2><span>{g.english}</span></div>
      </div>
      {g.warn && <p className="gpl-warn" role="note">{g.warn}</p>}
      <dl className="gpl-facts">
        <div><dt>Common varieties</dt><dd>{g.variety}</dd></div>
        <div><dt>First harvest</dt><dd>{g.harvest}</dd></div>
      </dl>
      <p className="gpl-prep"><b>Land prep:</b> {g.prep}</p>
      <p className="gpl-credit">
        Photo: {g.photo.author}, {LICENCE_URL[g.photo.licence] ? <a href={LICENCE_URL[g.photo.licence]} target="_blank" rel="noopener noreferrer">{g.photo.licence}</a> : g.photo.licence}{LICENCE_URL[g.photo.licence] ? ', cropped' : ''} <span className="gpl-nw">(<a href={g.photo.page} target="_blank" rel="noopener noreferrer">Wikimedia Commons</a>)</span>. Guide: {g.guide}.
      </p>
    </article>
  )
}

/** #garden/plant: one poster per vegetable with a guide, then the other crops of the month as "Guide coming". */
export function PlantPoster() {
  const c = useClimate()
  const d = useDaPrices()
  const [change, setChange] = useState(false)
  const month = useMonth()
  const dryIn = useDry(c.province)
  const head = <SubHeader title="Plant this month" backHref="#today" backLabel="Today" />
  if (!c.ready) return <section className="gpl-page">{head}</section>
  const picker = !c.type || change
  const list = c.type ? plantList(c.type, month, !!dryIn) : null
  const priced = !!d && !!list && list.guided.some((g) => priceOf(g, d))
  return (
    <section className="gpl-page" data-testid="plant-page">
      {head}
      {c.type && <p className="gpl-sub">{MONTH_NAMES[month - 1]}{typeWord(c.type, !!dryIn)}{c.guess && !dryIn ? ' (from your province)' : ''}.{priced && d ? ` Prices: Metro Manila markets, DA, ${priceDay(d.date)}.` : ''}</p>}
      {c.type && dryIn && list && <p className="gpl-sub gpl-dry" data-testid="plant-dry">{dryText(dryIn, (list.guided.length ? list.guided.map((g): Tile => ({ g })) : list.others.map((o): Tile => ({ name: o.name }))))}</p>}
      {picker && <div className="card gpl-card"><ClimatePicker current={c.type} onPick={(t) => { c.pick(t); setChange(false) }} /></div>}
      {list && list.guided.map((g, i) => <Poster key={g.name} g={g} price={priceOf(g, d)} date={d ? d.date : null} hero={i === 0} />)}
      {list && list.others.length > 0 && (
        <div className="card gpl-more" data-testid="plant-others">
          <h2>{list.guided.length ? 'More to plant this month' : `To plant in ${MONTH_NAMES[month - 1]}`}</h2>
          <ul>{list.others.map((o) => <li key={o.name}><b>{o.tagalog ? `${o.tagalog[0]!.toUpperCase()}${o.tagalog.slice(1)}` : o.name}</b>{o.tagalog ? ` (${o.name.toLowerCase()})` : ''} <span>Guide coming</span></li>)}</ul>
        </div>
      )}
      {c.type && !change && <button type="button" className="gpl-change" onClick={() => setChange(true)}>Change climate type (now type {c.type})</button>}
      <p className="gpl-foot">{PLANT_FOOTER} {PRICE_NOTE}</p>
    </section>
  )
}
