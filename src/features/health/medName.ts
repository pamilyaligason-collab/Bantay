/** Short, readable medicine name for dose rows and Next up. Imported labels arrive as "generic ( BRAND 050 FORM (CHILD) )"; this keeps what is on the box.
 *  Rules: drop qualifier-only brackets "(CHILD)", prefer a bracketed ALL-CAPS brand over the generic before it, drop strengths, pack sizes and noise words,
 *  sentence case, never drops the first word unless a brand bracket replaces it, max 28 chars cut at a word, and never end up empty (fall back to the raw label). */
const MAX = 28
const QUALIFIER = new Set(['child', 'children', 'adult', 'kids', 'pedia', 'pediatric', 'infant', 'baby', 'forte', 'plus'])
const NOISE = new Set(['hypertonic', 'isotonic', 'film-coated', 'coated', 'x', 'pack', 'pcs', 'of', 'mg', 'mcg', 'g', 'ml', 'iu'])
const UNIT = '(mg|mcg|ug|g|ml|l|iu|%)'
const STRENGTH = new RegExp(String.raw`^\d+([.,]\d+)?${UNIT}?(/\d*([.,]\d+)?${UNIT})?$`, 'i') // 500, 500mg, 250mg/5ml, 2.5mg/2.5ml

const words = (s: string) => s.split(/\s+/).filter(Boolean)
const letters = (s: string) => s.replace(/[^a-z]/gi, '')
/** A bracket is a note, not a name, when every word in it is a qualifier ("(CHILD)", "(Adult)"). */
const isNote = (s: string) => words(s.toLowerCase()).every((w) => QUALIFIER.has(w.replace(/[^a-z]/g, '')))
/** Words that mark a bracket as a salt, form or dosing note, not a brand: "(AS TRIHYDRATE)", "(TABLET)", "(BID)". */
const NOTE_WORDS = new Set(['as', 'equiv', 'equivalent', 'eq', 'tablet', 'tablets', 'tab', 'tabs', 'capsule', 'capsules', 'cap', 'caps', 'bid', 'tid', 'qid', 'od', 'hs', 'prn', 'oral', 'complex', 'trihydrate', 'dihydrate', 'monohydrate', 'anhydrous', 'besilate', 'hydrochloride', 'hcl', 'sodium', 'potassium', 'calcium', 'maleate', 'sulfate', 'sulphate', 'phosphate', 'acetate', 'succinate', 'tartrate', 'mesylate', 'er', 'xr', 'sr', 'mr'])
/** A bracket is a brand when it is written in capitals ("(FLUIMUCIL 600MG)") and its first word is a real word that is not a salt or form note;
 *  "(Ascorbic Acid)" is a generic alias, "(AS TRIHYDRATE)" a salt, "(BID)" a schedule, "(B-COMPLEX)" part of the generic: none of them replaces the first word. */
const isBrand = (s: string) => {
  const l = letters(s)
  const first = s.trim().split(/[\s-]+/)[0] ?? ''
  return l.length >= 3 && l === l.toUpperCase() && letters(first).length >= 3 && !NOTE_WORDS.has(letters(first).toLowerCase())
}

export function shortMedName(name: string): string {
  const raw = name.replace(/\s+/g, ' ').trim()
  if (!raw) return ''
  // 1. remove note-only brackets, innermost first
  let s = raw
  for (let i = 0; i < 4; i++) s = s.replace(/\(\s*([^()]*)\s*\)/g, (m, inner: string) => (isNote(inner) ? ' ' : m))
  // 2. outer text + one bracket group: a brand in the bracket wins
  const m = /^(.*?)\(\s*([^()]+?)\s*\)(.*)$/.exec(s)
  if (m) s = isBrand(m[2]!) ? m[2]! : `${m[1]} ${m[3]}`
  s = s.replace(/[()]/g, ' ')
  // 3. drop strengths, pack sizes and noise words
  const kept = words(s).filter((w) => !STRENGTH.test(w) && !/^x\d+$/i.test(w) && !NOISE.has(w.toLowerCase()))
  if (kept.length === 0) return raw.slice(0, MAX)
  // 4. sentence case (a lone capital like the C in "Vitamin C" stays), then fit
  const cased = kept.map((w, i) => (w.length === 1 ? w : i === 0 ? w[0]!.toUpperCase() + w.slice(1).toLowerCase() : w.toLowerCase()))
  let out = ''
  for (const w of cased) {
    const next = out ? `${out} ${w}` : w
    if (next.length > MAX && out) break
    out = next
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
