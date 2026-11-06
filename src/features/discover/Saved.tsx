import { EmptyState } from '../look'
import { LatestRow } from './news/Cards'
import { useSaved } from './news/saved'

/** Discover > Saved: the Read later list (kept only on this phone, newest saved first). Each row can be taken off again. */
export default function Saved({ now = Date.now() }: { now?: number }) {
  const saved = useSaved()
  if (!saved.length) return <EmptyState icon="info" title="Nothing saved yet" body="Tap the bookmark on a story in News to keep it here for later." />
  return (
    <div className="nw" data-testid="dc-saved">
      <h2 className="nw-h">Read later</h2>
      {saved.map((n) => <LatestRow key={n.id} n={n} now={now} saved />)}
    </div>
  )
}
