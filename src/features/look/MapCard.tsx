import { useEffect, useRef, type ReactNode } from 'react'
import { Icon } from '../shell/Icon'
import './v13.css'

/** A map in a card (contract 4): a static board image or a live map mounted by `render` (which returns its cleanup), a visible credit line, and an optional 44 px recentre button. */
export function MapCard(p: { title?: string; height?: number; image?: { src: string; alt: string }; render?: (el: HTMLDivElement) => () => void; credit: string; href?: string; onRecentre?: () => void; recentreLabel?: string; testId?: string; overlay?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => (ref.current ? p.render?.(ref.current) : undefined), [p.render]) // eslint-disable-line react-hooks/exhaustive-deps -- remount only when the render function changes
  const layer = p.image
    ? <div className="mapc-layer"><img src={p.image.src} alt={p.image.alt} /></div>
    : <div className="mapc-layer" ref={ref} aria-hidden="true" />
  return (
    <div className="card mapc" data-testid={p.testId} style={{ '--h': `${p.height ?? 200}px` } as React.CSSProperties}>
      {p.title && <h3 className="mapc-t">{p.title}</h3>}
      {p.href ? <a href={p.href} className="mapc-link" aria-label={p.title ?? p.credit}>{layer}</a> : layer}
      {p.overlay && <div className="mapc-ov">{p.overlay}</div>}
      {p.onRecentre && <button type="button" className="mapc-re" aria-label={p.recentreLabel ?? 'Recentre'} onClick={p.onRecentre}><Icon name="send" size={20} /></button>}
      <div className="mapc-credit">{p.credit}</div>
    </div>
  )
}
