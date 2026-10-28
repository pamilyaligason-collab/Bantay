import { jackSrc } from '../look'
import { offlineText, useOffline } from './useOffline'
import './offline.css'

/** Thin strip under the top of the screen while the phone has no connection. Says what the person is looking at and that nothing is lost. */
export function OfflineBar() {
  const { offline, since } = useOffline()
  if (!offline) return null
  return <div role="status" className="offline-bar" data-testid="offline-bar">{/* Eager plain <img>, not JackArt (lazy): this strip shows exactly when the network is gone. The 256 file is precached (vite.config.ts). Decorative: the words beside it say the same. */}<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><img className="jack" src={jackSrc('offline', 256)} width={40} height={40} alt="" aria-hidden />{offlineText(since)}</span></div>
}

/** Small "Queued" tag on a dose row that is saved on this phone and not yet sent. */
export function QueuedBadge() {
  return <span className="queued-badge" data-testid="queued-badge">Queued</span>
}
