import { track } from '../admin/events'

/** The big button on one paper in the check queue. */
export const confirmAllLabel = (n: number) => `Confirm all ${n} from this paper`
/** Whether the second big button earns its place: it must confirm something the first one does not. `skipped` = unclear lines left out. */
export const showConfirmAll = (all: number, checkedCount: number) => all > 0 && all !== checkedCount
export const confirmClearLabel = (n: number, skipped: boolean) => (skipped ? `Confirm ${n} clear ${n === 1 ? 'line' : 'lines'}` : confirmAllLabel(n))
/** "3 of 5 papers checked". Never shows more checked than the total, never a negative. */
export const progressText = (checked: number, total: number) => {
  const t = Math.max(0, Math.floor(total))
  return `${Math.min(t, Math.max(0, Math.floor(checked)))} of ${t} ${t === 1 ? 'paper' : 'papers'} checked`
}
/** "3 of 5 papers checked" (the Health overview row): papers, not single results. No papers at all: an invitation. */
export const papersLine = (checked: number, total: number) => {
  const t = Math.max(0, Math.floor(total))
  return t === 0 ? 'Add your first paper' : `${Math.min(t, Math.max(0, Math.floor(checked)))} of ${t} ${t === 1 ? 'paper' : 'papers'} checked`
}
/** Whole-number percent for a progress bar. */
export const progressPct = (checked: number, total: number) => (total > 0 ? Math.min(100, Math.round((Math.max(0, checked) / total) * 100)) : 0)

/** One records_confirmed event per confirmed document, however many rows it had. `seen` keeps a document from being counted twice in one session. */
export function emitConfirmed(docId: string, seen: Set<string>): boolean {
  if (seen.has(docId)) return false
  seen.add(docId)
  void track('action', 'records_confirmed')
  return true
}

// person names only; the server nameKey (records-extract/logic.ts) is for test and drug names and is not shared on purpose
const TITLES = new Set(['me', 'mr', 'mrs', 'ms', 'dr', 'sr', 'jr', 'engr'])
const words = (s: string) => s.toLowerCase().replace(/[()]/g, ' ').replace(/[.,]/g, '').split(/\s+/).filter((t) => t && !TITLES.has(t)) // "Me (Jun)" is Jun
/** The given-name word: the first word of "Given M. Surname", the first word after the comma in "SURNAME, GIVEN M.". */
const given = (s: string) => words(s.includes(',') ? s.slice(s.indexOf(',') + 1) : s)[0]
/**
 * S11 (hazard K1): true when the name printed on a paper cannot be shown to be the person (or one of their aliases) it was filed
 * under. A printed name fits only through its given-name word: it is the person's (or an alias's) first word, or a lone initial
 * that is that word's first letter ("J. Dela Cruz", "DELA CRUZ, J." for Juan). A middle initial never counts ("Rosa J. Dela Cruz"),
 * and a surname-only print ("Dela Cruz") fits no one, because a relative shares it: it is unclear and needs the acknowledgement.
 * An unread name is unknown, not a mismatch.
 */
export function nameMismatch(printed: string | null | undefined, person: string | undefined, aliases: string[] = []): boolean {
  if (!words(printed ?? '').length) return false
  const x = given(printed ?? '')
  const fits = (n: string) => { const g = given(n); return !!g && !!x && (x === g || (x.length === 1 && x === g[0])) }
  return ![person ?? '', ...aliases].some(fits)
}
