import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import type { Marker } from 'leaflet'
import { Icon, type IconName } from '../shell/Icon'
import type { PinKind } from './rows'

/** The symbol for each kind of hazard (one place, so the pins, the key and the lists agree). 'you' is the family place. */
export type MarkKind = PinKind | 'you'
export const MARK_ICON: Record<MarkKind, IconName> = { flood: 'flood', quake: 'quake', storm: 'typhoon', volcano: 'flame', other: 'warn', you: 'pin' }

/** A symbol in a tinted circle. Colour only tints it; the symbol (and the label beside it) carries the meaning. */
export function KindMark({ kind, size = 24 }: { kind: MarkKind; size?: number }) {
  return <span className={`wd-mark wd-${kind}`} style={{ width: size, height: size }} aria-hidden="true"><Icon name={MARK_ICON[kind]} size={16} /></span>
}

type Leaflet = typeof import('leaflet')
/** The KindMark markup, rendered once into a detached element (react-dom/server would add ~63 KB gzip to the bundle). */
function markHtml(kind: MarkKind, size: number): string {
  const el = document.createElement('div')
  const root = createRoot(el)
  flushSync(() => root.render(<KindMark kind={kind} size={size} />))
  const html = el.innerHTML
  root.unmount()
  return html
}

/** A Leaflet marker drawn as KindMark. */
export function kindMarker(L: Leaflet, at: [number, number], kind: MarkKind, interactive = true): Marker {
  const icon = L.divIcon({ className: 'wm-icon', html: markHtml(kind, 28), iconSize: [28, 28], iconAnchor: [14, 14] })
  return L.marker(at, { icon, interactive, keyboard: false })
}
