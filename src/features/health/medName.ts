/** Short, readable medicine name for dose rows and Next up. Imported labels arrive as "generic ( BRAND 050 FORM (CHILD) )"; this keeps what is on the box.
 *  Rules: drop qualifier-only brackets "(CHILD)", prefer a bracketed ALL-CAPS brand over the generic before it, drop strengths, pack sizes and noise words,
 *  sentence case, max 28 chars cut at a word, and never end up empty (fall back to the raw label). */
const MAX = 28
const QUALIFIER = new Set(['child', 'children', 'adult', 'kids', 'pedia', 'pediatric', 'infant', 'baby', 'forte', 'plus'])
const NOISE = new Set(['hypertonic', 'isotonic', 'film-coated', 'coated', 'x', 'pack', 'pcs', 'of', 'mg', 'mcg', 'g', 'ml', 'iu'])
const STRENGTH = /^\d+([.,]\d+)?(mg|mcg|ug|g|ml|l|iu|%|mg\/ml|mg\/5ml|mcg\/ml)?$/i

const words = (s: string) => s.split(/\s+/).filter(Boolean)
const letters = (s: string) => s.replace(/[^a-z]/gi, '')
/** A bracket is a note, not a name, when every word in it is a qualifier ("(CHILD)", "(Adult)"). */
const isNote = (s: string) => words(s.toLowerCase()).every((w) => QUALIFIER.has(w.replace(/[^a-z]/g, '')))
/** A bracket is a brand when it is written in capitals ("(FLUIMUCIL 600MG)"); "(Ascorbic Acid)" is a generic alias and is dropped. */
const isBrand = (s: string) => { const l = letters(s); return l.length >= 3 && l === l.toUpperCase() }

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
  return properName(clean(w))
}

/** Display casing for a person's name: a word that is all lower or all upper case ("loyd", "SEVILLA") becomes "Loyd"; mixed case ("McDonald") is left alone. */
export const properName = (n: string): string => n.replace(/\p{L}[\p{L}'’-]*/gu, (w) => (w === w.toLowerCase() || w === w.toUpperCase() ? w[0]!.toUpperCase() + w.slice(1).toLowerCase() : w))
