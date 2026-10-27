/** Short, readable medicine name for dose rows and Next up. Imported labels arrive as "generic ( BRAND 050 FORM (CHILD) )".
 *  Rule (J r3): the name is the first one or two words before any bracket, strength or pack size (the generic, or the brand when no generic is given),
 *  plus the dose form (spray, drops, syrup, tablet...) when it appears anywhere, with a route word before it ("nasal spray").
 *  Brackets are never used as the name, so the first word is never dropped. Sentence case, max 28 chars, never empty (falls back to the raw label). */
const MAX = 28
const FORMS: Record<string, string> = { spray: 'spray', drops: 'drops', syrup: 'syrup', tablet: 'tablet', tablets: 'tablet', tab: 'tablet', tabs: 'tablet', capsule: 'capsule', capsules: 'capsule', cap: 'capsule', caps: 'capsule', cream: 'cream', inhaler: 'inhaler', nebule: 'nebule' }
const ROUTES = new Set(['nasal', 'oral', 'eye', 'ear', 'topical'])
const STOP = new Set(['x', 'pack', 'pcs', 'of', 'hypertonic', 'isotonic', 'film-coated', 'coated'])

const clean = (w: string) => w.replace(/[^\p{L}\p{N}-]/gu, '')
const cap = (w: string, first: boolean) => (w.length <= 2 ? w.toUpperCase() : first ? w[0]!.toUpperCase() + w.slice(1).toLowerCase() : w.toLowerCase())

export function shortMedName(name: string): string {
  const raw = name.replace(/\s+/g, ' ').trim()
  if (!raw) return ''
  const open = raw.indexOf('(')
  // the words before the first bracket; a label that starts with a bracket uses the words inside it instead
  const lead = (open > 0 ? raw.slice(0, open) : raw.replace(/[()]/g, ' ')).split(/\s+/).map(clean).filter(Boolean)
  const base: string[] = []
  for (const w of lead) {
    if (base.length === 2 || /^\d/.test(w) || STOP.has(w.toLowerCase()) || ROUTES.has(w.toLowerCase()) || FORMS[w.toLowerCase()]) break
    base.push(w)
  }
  if (base.length === 0) return raw.slice(0, MAX)
  const all = raw.replace(/[(),]/g, ' ').split(/\s+/).filter(Boolean)
  const fi = all.findIndex((w) => FORMS[clean(w).toLowerCase()])
  let out = base.map((w, i) => cap(w, i === 0)).join(' ')
  if (fi >= 0) {
    const form = FORMS[clean(all[fi]!).toLowerCase()]!
    const route = fi > 0 && ROUTES.has(clean(all[fi - 1]!).toLowerCase()) ? `${clean(all[fi - 1]!).toLowerCase()} ` : ''
    if (`${out} ${route}${form}`.length <= MAX) out = `${out} ${route}${form}`
    else if (`${out} ${form}`.length <= MAX) out = `${out} ${form}`
  }
  return out.length > MAX ? `${out.slice(0, MAX - 1)}…` : out
}

const TITLES = new Set(['mr', 'mrs', 'ms', 'dr', 'engr', 'atty', 'sir', 'madam'])
const SUFFIXES = new Set(['jr', 'sr', 'ii', 'iii', 'iv', 'md', 'rn', 'phd'])
/** The given name for a bubble label, proper-cased. Handles "SURNAME, Given" (the word after the comma), a title first ("Dr. Ben Cruz" -> Ben) and a suffix after a comma ("Ben Cruz, Jr." -> Ben). */
export function givenName(full: string): string {
  const clean = (w: string) => w.replace(/[.,]/g, '')
  const comma = full.indexOf(',')
  const after = comma >= 0 ? (full.slice(comma + 1).trim().split(/\s+/)[0] ?? '') : ''
  const surnameFirst = comma >= 0 && after !== '' && !SUFFIXES.has(clean(after).toLowerCase())
  const ws = (surnameFirst ? full.slice(comma + 1) : comma >= 0 ? full.slice(0, comma) : full).trim().split(/\s+/).filter(Boolean)
  const w = ws.find((x) => !TITLES.has(clean(x).toLowerCase())) ?? ws[0] ?? ''
  const i = ws.indexOf(w)
  const next = ws[i + 1]
  if (/^ma\.$/i.test(w) && next) return `Ma. ${properName(clean(next))}` // "Ma." is Maria: "Ma. Clara Santos" -> "Ma. Clara"
  return properName(clean(w))
}

/** Display casing for a person's name: a word that is all lower or all upper case ("loyd", "SEVILLA") becomes "Loyd"; mixed case ("McDonald") is left alone. */
export const properName = (n: string): string => n.replace(/\p{L}[\p{L}'’-]*/gu, (w) => (w === w.toLowerCase() || w === w.toUpperCase() ? w[0]!.toUpperCase() + w.slice(1).toLowerCase() : w))
