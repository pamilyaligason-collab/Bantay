import { offlineText, useOffline } from './useOffline'
import './offline.css'

/** Thin strip under the top of the screen while the phone has no connection. Says what the person is looking at and that nothing is lost. */
export function OfflineBar() {
  const { offline, since } = useOffline()
  if (!offline) return null
  return <div role="status" className="offline-bar" data-testid="offline-bar">{offlineText(since)}</div>
}

/** Small "Queued" tag on a dose row that is saved on this phone and not yet sent. */
export function QueuedBadge() {
  return <span className="queued-badge" data-testid="queued-badge">Queued</span>
}
