import { useEffect, useRef, useState } from 'react'
import { inAppText } from './inApp'
import { addArchived, archivable, MIN_TO_OFFER, readArchive, removeArchived, type Archived } from './archive'
import { markAllSeen, unmarkSeen } from './store'
import { useAlertRows } from './useAlerts'
import { useActing } from '../viewas/viewAs'
import './notify.css'

export const UNDO_MS = 6000

/** "Archive all" on the Today notice stack (S22 H): every past or already-seen family alert goes at once through the existing markAllSeen.
 *  A live SOS and any active official warning are never in the set. Undo for 6 s; "Archived" lists what went (read-only). */
export default function ArchiveAll() {
  const rows = useAlertRows()
  const { acting } = useActing()
  const [archived, setArchived] = useState<Archived[]>(() => readArchive())
  const [undo, setUndo] = useState<{ ids: string[]; unseen: string[] } | null>(null)
  const [open, setOpen] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  const set = archivable(rows, new Set(archived.map((a) => a.row.id)))
  const archive = async () => {
    const keep = new Set(set.map((r) => r.id))
    const unseen = set.filter((r) => r.seenAt == null).map((r) => r.id)
    await markAllSeen(new Date(), (r) => keep.has(r.id))
    addArchived(set)
    setArchived(readArchive())
    setUndo({ ids: [...keep], unseen })
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setUndo(null), UNDO_MS)
  }
  const restore = async () => {
    if (!undo) return
    clearTimeout(timer.current)
    removeArchived(undo.ids)
    if (undo.unseen.length) await unmarkSeen(undo.unseen)
    setArchived(readArchive())
    setUndo(null)
  }
  if (acting) return null // the archive and these rows are the admin's own, never the viewed person's
  if (!undo && set.length < MIN_TO_OFFER && archived.length === 0) return null
  return (
    <div className="al-arch" role="group" aria-label="Past alerts" data-testid="archive-all">
      {set.length >= MIN_TO_OFFER && <button type="button" className="btn2" onClick={() => void archive()}>Archive all ({set.length})</button>}
      {undo && <span role="status" className="al-arch-undo">Archived. <button type="button" className="btn2" onClick={() => void restore()}>Undo</button></span>}
      {archived.length > 0 && <button type="button" className="btn2" aria-expanded={open} onClick={() => setOpen((o) => !o)}>Archived ({archived.length})</button>}
      {open && (
        <ul className="al-arch-list" aria-label="Archived alerts">
          {archived.map((a) => <li key={a.row.id}><b>{inAppText(a.row).title}</b> <span>{new Date(a.row.createdAt).toLocaleDateString()}</span></li>)}
        </ul>
      )}
    </div>
  )
}
