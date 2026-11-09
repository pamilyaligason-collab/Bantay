import { loadLabGlossary } from '../labsLogic'
import { loadMedlib, searchTopics, topicHref } from './encyclopedia'
import { searchFullLibrary } from './fullLibrary'
import { articleHref, normKey } from './medline'
import { labTitle } from './labTitles'

/** S26 (D-161): the ONE explainer resolver. Text (a lab name, a condition, a typed word) goes to the best article we have, in this order:
 *  1 lab glossary (t:<code>, offline)  2 exact curated topic (e:<id>, offline)  3 the full library when it is on the phone, exact title (f:<key>)
 *  4 nothing local: the c:/s: key stays, and the article asks MedlinePlus Connect by CODE (ICD-10 / LOINC / RxNorm name). */

/** Step 1, sync: the glossary key for a lab test code, name or alias. Null when the glossary has none (or is not loaded yet). */
export const labKey = (g: { labEntry(t: string): { code: string } | null } | null, text: string): string | null => {
  const e = g?.labEntry(text)
  return e ? `t:${e.code}` : null
}

/** The article key for `text`. `kind` is what the caller knows ('c' condition, 's' typed search). A lab or topic wins over the online look-up; the fallback is `<kind>:<text>`. */
export async function resolveKey(text: string, kind: 'c' | 's' = 's'): Promise<string> {
  const t = text.trim()
  const lab = labKey(await loadLabGlossary().catch(() => loadLabGlossary()).catch(() => null), t) // one more try when the chunk failed, so a flaky load is not read as 'no such lab'
  if (lab) return lab
  const known = labTitle(t) // the glossary did not load, but this is a lab: full library by its mdwiki title, else MedlinePlus Connect by LOINC; never the medicine look-up
  if (known) {
    const hit = known.title ? (await searchFullLibrary(known.title).catch(() => [])).find((h) => normKey(h.title) === normKey(known.title ?? '')) : undefined
    return hit ? `f:${hit.key}` : `l:${known.loinc}`
  }
  const n = normKey(t)
  try {
    const hit = searchTopics((await loadMedlib()).topics, t).find((x) => [x.title, ...x.aka].some((a) => normKey(a) === n))
    if (hit) return `e:${hit.id}`
  } catch { /* library chunk missing: go on */ }
  const full = (await searchFullLibrary(t).catch(() => [])).find((h) => normKey(h.title) === n)
  return full ? `f:${full.key}` : `${kind}:${t}`
}

/** The address for `text` (see resolveKey). */
export const resolveHref = async (text: string, kind: 'c' | 's' = 's'): Promise<string> => {
  const k = await resolveKey(text, kind)
  return k.startsWith('e:') ? topicHref(k.slice(2)) : articleHref(k[0] as 't' | 'f' | 'c' | 's', k.slice(2))
}
