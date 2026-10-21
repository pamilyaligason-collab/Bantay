import { useMemo, useState } from 'react'
import { LiteVideo } from '../media/LiteVideo'
import { Icon } from '../shell/Icon'
import { featured, type HubCard } from './hubLogic'
import './hub.css'

function Card({ c }: { c: HubCard }) {
  const [open, setOpen] = useState(false)
  const { item, category, size } = c
  const kind = item.kind === 'video' ? 'Video' : item.read ?? 'Read'
  const head = (
    <>
      <span className="hub-pic" aria-hidden="true"><Icon name={item.kind === 'video' ? 'play' : category.icon} size={size === 'feat' ? 32 : 26} /></span>
      <span className="hub-txt">
        <span className="hub-kind"><Icon name={item.kind === 'video' ? 'play' : 'file'} size={16} />{kind}</span>
        <b>{item.title}</b>
        {size !== 'sm' && <span className="sub">{item.blurb}</span>}
        <span className="hub-credit">{category.label} · {item.credit}</span>
      </span>
    </>
  )
  return (
    <li className={`hub-card ${size}${open ? ' open' : ''}`} data-cat={category.id}>
      {item.kind === 'link' ? (
        <a className="hub-main" href={item.url} target="_blank" rel="noopener noreferrer">{head}<span className="hub-sr"> (opens in new tab)</span></a>
      ) : (
        <>
          <button type="button" className="hub-main" aria-expanded={open} onClick={() => setOpen((v) => !v)}>{head}</button>
          {open && <div className="hub-video"><LiteVideo id={item.videoId!} title={item.title} /></div>}
        </>
      )}
    </li>
  )
}

/** Learn together (Family tab): one card per topic, a new pick each morning. Videos load nothing until tapped. */
export default function LearningHub() {
  const cards = useMemo(() => featured(new Date()), [])
  if (!cards.length) return null
  return (
    <section aria-labelledby="hub-h" data-testid="learn-hub">
      <h2 className="hd" id="hub-h">Learn together</h2>
      <ul className="hub">{cards.map((c) => <Card key={c.category.id} c={c} />)}</ul>
    </section>
  )
}
