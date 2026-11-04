import { Icon } from '../shell/Icon'

/** An outside link drawn like a Row (Row has no target option): 44 px or more, opens in a new tab. */
export function ExtRow({ title, url, sub = 'Opens in a new tab.' }: { title: string; url: string; sub?: string }) {
  return (
    <div className="rw" role="listitem">
      <a className="rw-main press" href={url} target="_blank" rel="noopener noreferrer">
        <span className="rw-lead rw-ic" data-tint="blue"><Icon name="out" size={20} /></span>
        <span className="rw-txt"><b className="rw-title">{title}</b><span className="rw-sub">{sub}</span></span>
      </a>
    </div>
  )
}
