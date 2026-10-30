import type { ReactNode } from 'react'
import { Icon, type IconName } from '../shell/Icon'
import type { Hue } from './cardParts'
import { Ring } from './Ring'
import './cards.css'

const Spark = ({ pts }: { pts: number[] }) => {
  const lo = Math.min(...pts), hi = Math.max(...pts), span = hi - lo || 1
  const d = pts.map((v, i) => `${i ? 'L' : 'M'}${(i / Math.max(1, pts.length - 1)) * 56} ${18 - ((v - lo) / span) * 16}`).join(' ')
  return <svg className="tl-spark" width="56" height="20" viewBox="0 0 56 20" aria-hidden="true" focusable="false"><path d={d} fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
}

/** Tile (C-1): 2-column grid, 24 px icon, label, one value line, optional sparkline or ring. The whole tile is the target (a link, a button, or plain when neither is given). The value stays visible text (ML-40). */
export function Tile(p: { hue: Hue; icon: IconName; label: string; value?: string; spark?: number[]; ring?: number; href?: string; onClick?: () => void; testId?: string }) {
  const inner: ReactNode = (
    <>
      <span className="hc-ic"><Icon name={p.icon} size={24} /></span>
      <span className="tl-txt"><b className="tl-label">{p.label}</b>{p.value && <span className="tl-value">{p.value}</span>}</span>
      {p.spark && p.spark.length > 1 && <Spark pts={p.spark} />}
      {p.ring !== undefined && <Ring value={p.ring} size={28} hue={p.hue} />}
    </>
  )
  const cls = 'card tl press'
  if (p.href) return <a className={cls} data-hue={p.hue} data-testid={p.testId} href={p.href} onClick={p.onClick}>{inner}</a>
  if (p.onClick) return <button type="button" className={cls} data-hue={p.hue} data-testid={p.testId} onClick={p.onClick}>{inner}</button>
  return <div className={cls} data-hue={p.hue} data-testid={p.testId}>{inner}</div>
}
