import { useEffect, useState } from 'react'
import { JackArt } from '../../look'
import { Icon } from '../../shell/Icon'
import { useKv } from '../../shell/useKv'
import Cook from './Cook'
import MedCard from './MedCard'
import Meds from './Meds'
import Recipe from './Recipe'
import Recipes from './Recipes'
import benefits from '../../../data/discover/benefits.json'
import './learn.css'

/** kv key: medicine and supplement cards stay hidden until the clinician has signed them off (PLAN R12). Recipes and cook mode always show. */
export const MEDCARDS_FLAG = 'learn.medcards'
const ROOT = '#discover/learn'
const BENEFITS = benefits.benefits

const useHash = () => {
  const [h, setH] = useState(() => location.hash)
  useEffect(() => { const f = () => setH(location.hash); window.addEventListener('hashchange', f); return () => window.removeEventListener('hashchange', f) }, [])
  return h
}

/** Discover > Learn. Routes: #discover/learn, /meds, /med/<id>, /recipes, /recipe/<id>, /cook/<id>. */
export default function Screen() {
  const [medcards] = useKv<boolean>(MEDCARDS_FLAG, false)
  const [, , view, id] = useHash().replace(/^#/, '').split('/')
  if (view === 'recipes') return <Recipes />
  if (view === 'recipe' && id) return <Recipe id={id} />
  if (view === 'cook' && id) return <Cook id={id} />
  if (medcards && view === 'meds') return <Meds />
  if (medcards && view === 'med' && id) return <MedCard id={id} />
  return (
    <div className="lr" data-testid="learn-home">
      <div className="s14j-art"><JackArt name="reading" size={96} /></div>
      {medcards && (
        <section className="dc-shelf" aria-label="Medicine guide">
          <h2 className="sh-h2 dc-shelf-h">Medicine guide</h2>
          <a className="card press lr-tile" href={ROOT + '/meds'}>
            <Icon name="pill" boxed tone="medicine" />
            <span className="lr-grow"><b className="sh-h2">Medicine wiki</b><span className="sub">What your medicines do, how to take them, and what not to mix.</span></span>
            <Icon name="chev" />
          </a>
        </section>
      )}
      <section className="dc-shelf" aria-label="Recipes">
        <h2 className="sh-h2 dc-shelf-h">Recipes</h2>
        <a className="card press lr-tile" href={ROOT + '/recipes'}>
          <Icon name="meal" boxed tone="family" />
          <span className="lr-grow"><b className="sh-h2">Healthy recipes</b><span className="sub">Low salt Filipino dishes, with the salt in each serving.</span></span>
          <Icon name="chev" />
        </a>
      </section>
      <section className="dc-shelf" aria-label="Health reads">
        <h2 className="sh-h2 dc-shelf-h">Health reads</h2>
        <a className="card press lr-tile" href="#health/library">
          <Icon name="file" boxed tone="labs" />
          <span className="lr-grow"><b className="sh-h2">Health library</b><span className="sub">Short plain-English reads from MedlinePlus.</span></span>
          <Icon name="chev" />
        </a>
      </section>
      <section className="dc-shelf" aria-label="Your benefits">
        <h2 className="sh-h2 dc-shelf-h">Your benefits</h2>
        {BENEFITS.map((b) => (
          <a key={b.id} className="card press lr-tile" href={b.url} target="_blank" rel="noopener noreferrer">
            <span className="lr-grow"><b className="sh-h2">{b.title}</b><span className="sub">{b.body}</span><span className="dc-src">Source: {b.source}, checked {b.checked}</span></span>
            <Icon name="out" />
            <span className="dc-sr">Opens outside the app</span>
          </a>
        ))}
      </section>
    </div>
  )
}
