import { useEffect, useState } from 'react'
import { Icon } from '../../shell/Icon'
import { useKv } from '../../shell/useKv'
import Cook from './Cook'
import MedCard from './MedCard'
import Meds from './Meds'
import Recipe from './Recipe'
import Recipes from './Recipes'
import './learn.css'

/** kv key: medicine and supplement cards stay hidden until the clinician has signed them off (PLAN R12). Recipes and cook mode always show. */
export const MEDCARDS_FLAG = 'learn.medcards'
const ROOT = '#discover/learn'

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
      {medcards && (
        <a className="card lr-tile" href={ROOT + '/meds'}>
          <Icon name="pill" boxed tone="medicine" />
          <span className="lr-grow"><b className="sh-h2">Medicine wiki</b><span className="sub">What your medicines do, how to take them, and what not to mix.</span></span>
          <Icon name="chev" />
        </a>
      )}
      <a className="card lr-tile" href={ROOT + '/recipes'}>
        <Icon name="meal" boxed tone="family" />
        <span className="lr-grow"><b className="sh-h2">Healthy recipes</b><span className="sub">Low salt Filipino dishes, with the salt in each serving.</span></span>
        <Icon name="chev" />
      </a>
    </div>
  )
}
