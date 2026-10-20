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
/** Whole-number percent for a progress bar. */
export const progressPct = (checked: number, total: number) => (total > 0 ? Math.min(100, Math.round((Math.max(0, checked) / total) * 100)) : 0)

/** One records_confirmed event per confirmed document, however many rows it had. `seen` keeps a document from being counted twice in one session. */
export function emitConfirmed(docId: string, seen: Set<string>): boolean {
  if (seen.has(docId)) return false
  seen.add(docId)
  void track('action', 'records_confirmed')
  return true
}
