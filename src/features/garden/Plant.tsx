import { useState } from 'react'
import { Section } from '../look'
import { SubHeader } from '../shell/SubHeader'
import type { ClimateType } from '../../data/provinceClimate'
import { CLIMATE_TYPES, cropsFor, MONTH_NAMES, useClimate } from './climate'
import { priceDay, priceFor, priceText, useDaPrices, type DaPrices, type DaRow } from './daPrices'
import { guideFor, VEG_GUIDE, type VegGuide } from './vegGuide'
import './garden.css'

export const PLANT_FOOTER = 'General guide from the Bureau of Plant Industry planting calendar (PCAARRD bulletin 200, 2000).'
export const PRICE_NOTE = 'Prices are Metro Manila; local prices may differ.'
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)

/** Crops in the bulletin for this type and month: the ones with a written guide first (poster order), then the rest. */
export function plantList(type: ClimateType, month: number): { guided: VegGuide[]; others: { name: string; tagalog: string | null }[] } {
  const crops = cropsFor(type, month)
  const names = new Set(crops.map((c) => c.name))
  return { guided: VEG_GUIDE.filter((g) => names.has(g.calendar)), others: crops.filter((c) => !guideFor(c.name)) }
}
const priceOf = (g: VegGuide, d: DaPrices | null | undefined): DaRow | null => (d ? priceFor(d.rows, g.price) : null)

/** The "Pick your area's climate type" choice (types 1-4, one line each). The pick is saved on the phone. */
export function ClimatePicker({ suggested, current, onPick }: { suggested?: ClimateType | null; current?: ClimateType | null; onPick: (t: ClimateType) => void }) {
  return (
    <fieldset className="gpl-pick" data-testid="climate-picker">
      <legend>Pick your area's climate type</legend>
      {suggested && <p className="gpl-sub">We are not sure for your area. Our best guess is type {suggested}.</p>}
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
  const month = new Date().getMonth() + 1
  if (!c.ready) return null
  if (!c.type) return <Section title="Plant this month" testId="today-plant"><div className="card gpl-card"><ClimatePicker suggested={c.suggested} onPick={c.pick} /></div></Section>
  const { guided, others } = plantList(c.type, month)
  const tiles: ({ g: VegGuide } | { name: string })[] = [...guided.map((g) => ({ g })), ...others.map((o) => ({ name: o.name }))].slice(0, 3)
  const total = guided.length + others.length
  if (!tiles.length) return null
  const first = guided[0]
  const anyPrice = tiles.some((t) => 'g' in t && priceOf(t.g, d))
  return (
    <Section title="Plant this month" link={{ href: '#garden/plant', label: total > 3 ? `See all ${total}` : 'See more' }} testId="today-plant">
      <a className="card gpl-card" href="#garden/plant" data-testid="plant-card">
        <span className="gpl-sub">{MONTH_NAMES[month - 1]}, climate type {c.type}{anyPrice ? ' · DA prices, Metro Manila' : ''}</span>
        <span className="gpl-tiles">
          {tiles.map((t) => 'g' in t ? (
            <span key={t.g.name} className="gpl-tile"><img src={t.g.img} alt={t.g.alt} loading="lazy" /><span className="gpl-tn">{t.g.name}{priceOf(t.g, d) && <small>{priceText(priceOf(t.g, d)!)}</small>}</span></span>
          ) : (
            <span key={t.name} className="gpl-tile gpl-tile--bare"><span className="gpl-tn">{t.name}<small>Guide coming</small></span></span>
          ))}
        </span>
        <span className="gpl-line">{first ? <><b>{first.name}</b>: first harvest in {lower(first.harvest)}. Tap for variety, land prep and price.</> : <>Tap to see what to plant in {MONTH_NAMES[month - 1]}.</>}</span>
      </a>
    </Section>
  )
}

function Poster({ g, price, date, hero }: { g: VegGuide; price: DaRow | null; date: string | null; hero: boolean }) {
  return (
    <article className={hero ? 'gpl-poster gpl-hero' : 'gpl-poster'} data-testid={`poster-${g.calendar}`}>
      <div className="gpl-pic">
        <img src={g.img} alt={g.alt} loading={hero ? 'eager' : 'lazy'} />
        <span className="gpl-tag">PLANT NOW</span>
        {price && <span className="gpl-price"><b>{priceText(price)}</b><span>{date ? `DA, ${priceDay(date)}` : 'DA'}</span></span>}
        <div className="gpl-cap"><h2>{g.name}</h2><span>{g.english}</span></div>
      </div>
      {g.warn && <p className="gpl-warn" role="note">{g.warn}</p>}
      <dl className="gpl-facts">
        <div><dt>Variety</dt><dd>{g.variety}</dd></div>
        <div><dt>First harvest</dt><dd>{g.harvest}</dd></div>
      </dl>
      <p className="gpl-prep"><b>Land prep:</b> {g.prep}</p>
      <p className="gpl-credit">
        Photo: {g.photo.author}, {g.photo.licence} (<a href={g.photo.page} target="_blank" rel="noopener noreferrer">Wikimedia Commons</a>). Guide: {g.guide}.
      </p>
    </article>
  )
}

/** #garden/plant: one poster per vegetable with a guide, then the other crops of the month as "Guide coming". */
export function PlantPoster() {
  const c = useClimate()
  const d = useDaPrices()
  const [change, setChange] = useState(false)
  const month = new Date().getMonth() + 1
  const head = <SubHeader title="Plant this month" backHref="#today" backLabel="Today" />
  if (!c.ready) return <section className="gpl-page">{head}</section>
  const picker = !c.type || change
  const list = c.type ? plantList(c.type, month) : null
  const priced = !!d && !!list && list.guided.some((g) => priceOf(g, d))
  return (
    <section className="gpl-page" data-testid="plant-page">
      {head}
      {c.type && <p className="gpl-sub">{MONTH_NAMES[month - 1]}, climate type {c.type}.{priced && d ? ` Prices: Metro Manila markets, DA, ${priceDay(d.date)}.` : ''}</p>}
      {picker && <div className="card gpl-card"><ClimatePicker suggested={c.suggested} current={c.type} onPick={(t) => { c.pick(t); setChange(false) }} /></div>}
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
