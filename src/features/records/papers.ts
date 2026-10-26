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

const nameKey = (s: string) => s.toLowerCase().replace(/[()]/g, ' ').replace(/[.,]/g, '').replace(/\s+/g, ' ').trim()
const toks = (s: string) => new Set(nameKey(s).split(' ').filter((t) => t.length > 1 && t !== 'me')) // initials never identify anyone; "Me (Jun)" is Jun
/**
 * S11 (hazard K1): true when the name printed on a paper does not fit the person (or one of their aliases) it was filed under.
 * A fit = same words in any order, or all words of one name inside the other ("Juan Cruz" / "Juan Dela Cruz"). An unread name is
 * unknown, not a mismatch.
 */
export function nameMismatch(printed: string | null | undefined, person: string | undefined, aliases: string[] = []): boolean {
  const p = toks(printed ?? '')
  if (p.size === 0) return false
  const fits = (n: string) => { const t = toks(n); return t.size > 0 && ([...t].every((x) => p.has(x)) || [...p].every((x) => t.has(x))) }
  return ![person ?? '', ...aliases].some(fits)
}
