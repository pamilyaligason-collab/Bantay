// Pure news rules (NEWS-PH): what reaches the World "Macro and news" list, which GDACS events count, and the category tag on a card.
// Allow and block word lists. Pure and import-free so the app and the Edge Function share one copy.
// Titles are third-party text: only tested, never interpreted.

const W = (src: string, flags = 'i') => new RegExp(`(?<![\\p{L}\\p{N}])(?:${src})(?![\\p{L}\\p{N}])`, `${flags}u`)
/** The Philippine Area of Responsibility. Case-sensitive on purpose: the word "par" is not it. */
const PAR = W('PAR', '')
/** The World Health Organization. Case-sensitive on purpose: the pronoun "who" is not it. */
const WHO_ACR = W('WHO', ''), WHO_NAME = W('world health organi[sz]ation') // acronym case-sensitive (not the pronoun), full name any case
const WHO = { test: (t: string) => WHO_NAME.test(t) || (WHO_ACR.test(t) && t !== t.toUpperCase()) } // in an all-caps headline WHO is usually the pronoun
const SEA = W('strait of hormuz|red sea|south china sea|taiwan strait|houthis?')

/** Oil as a price story: bare "crude", "diesel" or "petrol" (crude remarks, a diesel engine maker) do not count. */
const OIL_WORD = W('oil prices?|crude oil|crude prices?|brent|opec\\+?|fuel prices?|pump prices?|(?:petrol|diesel|gasoline) prices?|lpg|energy crisis|oil supply')
/** World items stay only when they touch the Philippines. Each rule is one reason; the first match wins. */
export const PH_RULES: { id: string; re: RegExp }[] = [
  { id: 'philippines', re: W('philippines?|filipinos?|filipinas?|pinoys?|ofws?|pagasa|phivolcs|ndrrmc|manila|luzon|visayas|mindanao|cebu|davao|west philippine sea|marcos') },
  { id: 'storm', re: W('typhoons?|signal no\\.? ?\\d|low pressure area') }, // typhoon is the western Pacific word; a Gulf of Mexico tropical storm is not it
  { id: 'par', re: PAR },
  { id: 'oil', re: OIL_WORD },
  { id: 'oil', re: W('oil embargo|oil shock') },
  { id: 'peso', re: W('peso|bsp|bangko sentral|remittances?') },
  { id: 'pandemic', re: W('pandemics?|public health emergency|pheic|emergency committee') },
  { id: 'pandemic', re: W('WHO (?:declares|emergency)', '') },
  { id: 'sea', re: SEA }
]
const CONFLICT_PLACE = W('middle east|iran|iranian|israel|israeli|gaza|hormuz|red sea|south china sea|west philippine sea|taiwan|houthis?|persian gulf|lebanon|yemen')
const CONFLICT_WORD = W('war|wars|conflict|strikes?|attacks?|missiles?|ceasefire|tensions?|invasion|blockade|military|clashes|escalat\\w*|retaliat\\w*|drills')
const TRADE_WORD = W('tariffs?|trade war|export (?:ban|curbs?|controls?)')
const SANCTIONS = W('sanctions')
const CHINA = W('china|chinese')
const STORM_ABROAD = W('tropical (?:storm|depression|cyclone)|super typhoon')
const TRADE_PLACE = W('china|chinese|asean|american|united states|u\\.s\\.|trump')
const QUAKE_WORD = W('earthquakes?|quakes?|tsunamis?|volcano|volcanic|eruption')
const RIM = W('japan|taiwan|indonesia|papua new guinea|pacific|ring of fire|guam|mariana|okinawa|ryukyu|tonga|kuril|palau|micronesia|vanuatu|solomon islands|philippine sea')

/** The reason a world item concerns the Philippines, or null. */
export function phImpact(title: string): string | null {
  for (const r of PH_RULES) if (r.re.test(title)) return r.id
  if (CONFLICT_PLACE.test(title) && CONFLICT_WORD.test(title)) return 'conflict'
  if ((TRADE_WORD.test(title) && TRADE_PLACE.test(title)) || (SANCTIONS.test(title) && CHINA.test(title))) return 'trade'
  if (STORM_ABROAD.test(title) && (RIM.test(title) || mentionsPh(title))) return 'storm'
  if (QUAKE_WORD.test(title) && RIM.test(title)) return 'quake'
  return null
}

// ---- health and wellbeing: no showbiz, crime or death clickbait ----
const HARD_BLOCK = W('celebrit\\w*|showbiz|actors?|actress(?:es)?|singers?|kapuso|kapamilya|love ?team|idol|k-?pop|scandal|breakup|(?:went|goes|going|gone) viral|viral (?:video|post|photo|clip|moment)|netizens?|vlogger|influencer|pageant|beauty queen|sexy|hottie')
const SOFT_BLOCK = W('dies|died|dead|death|killed|killing|slain|murder\\w*|shooting|shot dead|stabbed|rape|kidnapp\\w*|arrested|lawsuit|sued|suspect|massacre|crash')
const ALLOW_CI = W('dengue|doh|vaccin\\w*|outbreak|measles|tuberculosis|tb|diet|nutrition|exercise|sleep|mental health|wellness|hospital|clinic|blood pressure|diabetes|hypertension|heat index|public health')
const ALLOW = { test: (t: string) => ALLOW_CI.test(t) || WHO.test(t) }
/** True when a health or wellbeing headline is showbiz, crime or death clickbait. A real health word rescues a death headline (an outbreak toll), never a celebrity one. */
export const isClickbait = (title: string): boolean => HARD_BLOCK.test(title) || (SOFT_BLOCK.test(title) && !ALLOW.test(title))

/** A wellbeing feed (a lifestyle section is mostly entertainment) keeps only stories that talk about wellbeing or health. */
const WELL = W('health\\w*|wellness|well-?being|mental|stress\\w*|sleep\\w*|anxiety|burnout|suicid\\w*|crisis (?:line|hotline)|mental health crisis|hotline|self-harm|self-care|mindful\\w*|meditat\\w*|therapy|exercise|fitness|workout|nutrition|diet|yoga|hydrat\\w*|calm|resilien\\w*|depress\\w*|loneliness|mood|gratitude|screen time')
export const isWellbeingStory = (title: string): boolean => WELL.test(title)

// ---- GDACS: only events in or near the Philippines ----
export interface GeoProbe { title?: string; desc?: string; lat?: number | null; lon?: number | null; country?: string }
const BOX = { s: 4, n: 22, w: 114, e: 128 }
export const NEAR_KM = 500
/** A tropical cyclone (a storm that travels for days) counts out to ~1500 km of the PH box, about the PAR plus its approach. */
export const CYCLONE_KM = 1500
const CYCLONE = /typhoon|cyclone|tropical/i
/** Great-circle kilometres from a point to the nearest point of the Philippines box (0 inside it). */
export function kmFromPh(lat: number, lon: number): number {
  const la = Math.min(Math.max(lat, BOX.s), BOX.n), lo = Math.min(Math.max(lon, BOX.w), BOX.e)
  const r = (d: number) => (d * Math.PI) / 180
  const a = Math.sin(r(la - lat) / 2) ** 2 + Math.cos(r(lat)) * Math.cos(r(la)) * Math.sin(r(lo - lon) / 2) ** 2
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(a)))
}
const PH_NAMED = W('philippines?|pagasa|philippine area of responsibility')
const mentionsPh = (s: string) => PH_NAMED.test(s) || PAR.test(s)
/** A GDACS event is kept when its country tag names the Philippines, its point lies within 500 km of the PH box (a cyclone: 1500 km), or (a typhoon, no position) its text names the Philippines or PAR.
 *  No position and no mention: dropped, so a far forest fire never shows. */
export function gdacsKeep(g: GeoProbe): boolean {
  if (/philippines/i.test(g.country ?? '')) return true
  if (mentionsPh(g.title ?? '')) return true // a title naming the Philippines or PAR counts for any event, a far cyclone days from landfall included
  const text = `${g.title ?? ''} ${g.desc ?? ''}`
  const has = typeof g.lat === 'number' && typeof g.lon === 'number' && Number.isFinite(g.lat) && Number.isFinite(g.lon)
  // cyclone with a position: distance alone decides (a PAR mention in the description alone no longer keeps a far one); no position falls to the text rule below
  if (has && CYCLONE.test(g.title ?? '')) return kmFromPh(g.lat as number, g.lon as number) <= CYCLONE_KM
  if (has && kmFromPh(g.lat as number, g.lon as number) <= NEAR_KM) return true
  return CYCLONE.test(text) && mentionsPh(text)
}

// ---- the category tag on a card ----
const STORM = W('typhoons?|tropical (?:storm|depression|cyclone)|cyclones?|pagasa|signal no\\.? ?\\d|low pressure area|storm surge|habagat|amihan|shear line|monsoon')
const OIL = W('oil|fuel|lpg|crude oil|crude prices?|brent|opec\\+?|(?:petrol|diesel|gasoline) prices?|pump prices?')
const MONEY = W('peso|bsp|bangko sentral|remittances?|inflation|tariffs?|trade war|rice prices?|food prices?')
const WAR = W('war|conflict|ceasefire|missiles?|invasion|military|houthis?')
/** The tag shown on a card (TYPHOON, OIL AND PRICES, HEALTH, PHILIPPINES ...), from the headline and the feed's topic. Health and wellbeing topics keep their own tag. Null when nothing fits. */
export function categoryOf(title: string, topic?: string | null): string | null {
  if (topic === 'wellbeing') return 'WELLBEING'
  if (topic === 'health') return 'HEALTH'
  if (STORM.test(title) || PAR.test(title)) return 'TYPHOON'
  if (QUAKE_WORD.test(title)) return 'QUAKE'
  if (OIL.test(title)) return 'OIL AND PRICES'
  if (MONEY.test(title)) return 'ECONOMY'
  if ((CONFLICT_PLACE.test(title) || SEA.test(title)) && WAR.test(title)) return 'CONFLICT'
  if (/pandemic|outbreak|public health emergency/i.test(title)) return 'HEALTH'
  if (topic === 'prepping') return 'PREPAREDNESS'
  if (topic === 'national') return 'PHILIPPINES'
  if (topic === 'world') return 'WORLD'
  return null
}
