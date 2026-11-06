import { useEffect, useState, useSyncExternalStore } from 'react'
import { inAppText } from './inApp'
import { addArchived, archivable, MIN_TO_OFFER, ARCHIVE_EVENT, readArchive, removeArchived, type Archived } from './archive'
import { markAllSeen, unmarkSeen, type AlertRow } from './store'
import { useAlertRows } from './useAlerts'
import { useActing } from '../viewas/viewAs'
import './notify.css'

export const UNDO_MS = 6000

/** The one archive action, shared with the Archive all link on Today's red card: marks the set seen, files it in the local archive (which fires ARCHIVE_EVENT) and returns what Undo needs. */
export async function archiveRows(set: AlertRow[]): Promise<{ ids: string[]; unseen: string[] }> {
  const keep = new Set(set.map((r) => r.id))
  const unseen = set.filter((r) => r.seenAt == null).map((r) => r.id)
  await markAllSeen(new Date(), (r) => keep.has(r.id))
  addArchived(set)
  return { ids: [...keep], unseen }
}

// One Undo for both entry points (this group and the Archive all link on Today's red card): module state, so whichever button archived, this group shows the one toast.
interface UndoState { undo: { ids: string[]; unseen: string[] } | null; failed: boolean }
let ustate: UndoState = { undo: null, failed: false }
let utimer: ReturnType<typeof setTimeout> | undefined
const ulisten = new Set<() => void>()
const setU = (n: UndoState) => { ustate = n; ulisten.forEach((f) => f()) }
const subU = (f: () => void) => { ulisten.add(f); return () => { ulisten.delete(f) } }

/** Archive and offer the 6 s Undo. A failed write shows a message in the group instead of vanishing. */
export async function archiveWithUndo(set: AlertRow[]): Promise<void> {
  clearTimeout(utimer)
  try {
    setU({ undo: await archiveRows(set), failed: false })
    utimer = setTimeout(() => setU({ undo: null, failed: false }), UNDO_MS)
  } catch { setU({ undo: null, failed: true }) }
}

async function restoreUndo(): Promise<void> {
  const u = ustate.undo
  if (!u) return
  clearTimeout(utimer)
  try {
    removeArchived(u.ids)
    if (u.unseen.length) await unmarkSeen(u.unseen)
    setU({ undo: null, failed: false })
  } catch { setU({ undo: null, failed: true }) }
}

/** Test helper: drop any pending Undo between tests. */
export function resetArchiveUndo(): void { clearTimeout(utimer); setU({ undo: null, failed: false }) }

/** "Archive all" on the Today notice stack (S22 H): every past or already-seen family alert goes at once through the existing markAllSeen.
 *  A live SOS and any active official warning are never in the set. Undo for 6 s; "Archived" lists what went (read-only). */
export default function ArchiveAll() {
  const rows = useAlertRows()
  const { acting } = useActing()
  const [archived, setArchived] = useState<Archived[]>(() => readArchive())
  const { undo, failed } = useSyncExternalStore(subU, () => ustate)
  const [open, setOpen] = useState(false)
  useEffect(() => { // the red card on Today can archive too: keep this list in step
    const on = () => setArchived(readArchive())
    window.addEventListener(ARCHIVE_EVENT, on)
    return () => window.removeEventListener(ARCHIVE_EVENT, on)
  }, [])
  const set = archivable(rows, new Set(archived.map((a) => a.row.id)))
  if (acting) return null // the archive and these rows are the admin's own, never the viewed person's
  if (!undo && !failed && set.length < MIN_TO_OFFER && archived.length === 0) return null
  return (
    <div className="al-arch" role="group" aria-label="Past alerts" data-testid="archive-all">
      {set.length >= MIN_TO_OFFER && <button type="button" className="btn2" aria-label={`Archive all past notices (${set.length})`} onClick={() => void archiveWithUndo(set)}>Archive all ({set.length})</button>}
      {undo && <span role="status" className="al-arch-undo">Archived. <button type="button" className="btn2" onClick={() => void restoreUndo()}>Undo</button></span>}
      {failed && <span role="alert" className="al-arch-undo">Could not archive. Try again.</span>}
      {archived.length > 0 && <button type="button" className="btn2" aria-expanded={open} onClick={() => setOpen((o) => !o)}>Archived ({archived.length})</button>}
      {open && (
        <ul className="al-arch-list" aria-label="Archived alerts">
          {archived.map((a) => <li key={a.row.id}><b>{inAppText(a.row).title}</b> <span>{new Date(a.row.createdAt).toLocaleDateString()}</span></li>)}
        </ul>
      )}
    </div>
  )
}
