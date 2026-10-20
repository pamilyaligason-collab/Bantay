import { track } from '../admin/events'

/** The big button on one paper in the check queue. */
export const confirmAllLabel = (n: number) => `Confirm all ${n} from this paper`
/** "180 of 229 checked". Never shows more checked than the total, never a negative. */
export const progressText = (checked: number, total: number) => {
  const t = Math.max(0, Math.floor(total))
  return `${Math.min(t, Math.max(0, Math.floor(checked)))} of ${t} checked`
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
