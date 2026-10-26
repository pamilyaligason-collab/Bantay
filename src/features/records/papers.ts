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
const words = (s: string) => s.toLowerCase().replace(/[()]/g, ' ').replace(/[.,]/g, '').split(/\s+/).filter((t) => t && t !== 'me') // "Me (Jun)" is Jun
/**
 * S11 (hazard K1): true when the name printed on a paper cannot be shown to be the person (or one of their aliases) it was filed
 * under. A printed name fits only through the given name: the person's first word (or an alias's) appears in it, or one of its
 * initials is that word's first letter ("J. Dela Cruz" for Juan). A surname-only print ("Dela Cruz", "DELA CRUZ, R.") fits no one,
 * because a relative shares it: it is unclear and needs the acknowledgement. An unread name is unknown, not a mismatch.
 */
export function nameMismatch(printed: string | null | undefined, person: string | undefined, aliases: string[] = []): boolean {
  const p = words(printed ?? '')
  if (p.length === 0) return false
  const fits = (n: string) => { const g = words(n)[0]; return !!g && p.some((x) => x === g || (x.length === 1 && x === g[0])) }
  return ![person ?? '', ...aliases].some(fits)
}
