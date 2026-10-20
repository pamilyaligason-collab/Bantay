import { pickLocalSet, type LatLon } from '../location/geo'
import { type Entry, ZONE_SET } from './entries'

type Dialable = Entry & { phone: string }

/** Quick dial: sourced (confirmed, listed, unverified) or family-added entries with a number get a Call button; the rest wait under "Add a local number".
 *  UNVERIFIED numbers are dialable but carry a "check" mark in the screen. Link rows (apps, web services) have no number and are opened from their source. */
export function splitDial(entries: Entry[]): { groups: { name: string; items: Dialable[] }[]; missing: Entry[] } {
  const has = (e: Entry): e is Dialable => e.status !== 'UNKNOWN' && typeof e.phone === 'string' && e.phone.trim() !== ''
  const ok = entries.filter(has)
  return {
    groups: [...new Set(ok.map((e) => e.group))].map((name) => ({ name, items: ok.filter((e) => e.group === name) })),
    missing: entries.filter((e) => !has(e) && !e.link)
  }
}

export const isLink = (e: Entry): e is Entry & { sourceUrl: string } => e.link === true && e.status !== 'UNKNOWN' && !!e.sourceUrl
export const needsCheck = (e: Entry) => e.status === 'UNVERIFIED'
export const CHECK_LABEL = 'number not yet confirmed'

/** Where to look up the emergency number of a country we have no list for. Never a guessed number. */
export const ABROAD_SOURCE = { label: 'Emergency numbers by country', url: 'https://en.wikipedia.org/wiki/List_of_emergency_telephone_numbers' }

export interface DialSet {
  id: string
  header: string
  entries: Entry[]
}
export interface DialPlan {
  where: 'area' | 'ph' | 'abroad'
  /** One line that says why these sets show; null inside a local area (the first header says it). */
  note: string | null
  sets: DialSet[]
  /** Local area with no entry at all, or Philippines outside every area: admins may add numbers. */
  noLocal: boolean
  abroad: boolean
}

const inSet = (entries: Entry[], id: string) => entries.filter((e) => e.zone === id)

/** PART-3 4.1 order: the one local set (if any), national (Philippines only), OFW, teleconsult.
 *  `entries` is the seed after family edits. `fromGps` only changes the wording ("You are in" vs "Your home area is"). */
export function planDial(pos: LatLon, entries: Entry[], fromGps: boolean): DialPlan {
  const pick = pickLocalSet(pos)
  const sets: DialSet[] = []
  let note: string | null = null
  if (pick.where === 'area') {
    const local = inSet(entries, pick.area.id)
    sets.push({ id: pick.area.id, header: `${fromGps ? 'You are in' : 'Your home area is'} ${pick.area.name}`, entries: local })
  } else if (pick.where === 'ph') note = 'You are outside our local lists. National numbers work everywhere in the Philippines.'
  else note = 'You are outside the Philippines. Below are numbers for Filipinos abroad.'
  if (pick.where !== 'abroad' && !(pick.where === 'area' && pick.area.id === 'texas')) sets.push({ id: 'ph', header: 'Philippines, national', entries: inSet(entries, 'ph') })
  sets.push({ id: 'ofw', header: 'Filipinos abroad (OFW)', entries: inSet(entries, 'ofw') })
  sets.push({ id: 'tele', header: 'Talk to a doctor by phone', entries: inSet(entries, 'tele') })
  return { where: pick.where, note, sets, noLocal: pick.where === 'ph' || (pick.where === 'area' && sets[0]!.entries.length === 0), abroad: pick.where === 'abroad' }
}

/** True when our per-area data (places, hazard readings) was gathered for where the person is: the home zone chosen, or a phone position inside that zone's hotline area. */
export function coversHere(place: { weather: LatLon; source: string; zone: string }): boolean {
  if (place.source === 'zone') return true
  const here = pickLocalSet(place.weather)
  return here.where === 'area' && ZONE_SET[place.zone] === here.area.id
}
