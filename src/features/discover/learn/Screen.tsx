import { useEffect, useState } from 'react'
import { JackArt, Tile, type Hue } from '../../look'
import { Icon, type IconName } from '../../shell/Icon'
import { SubHeader } from '../../shell/SubHeader'
import { useKv } from '../../shell/useKv'
import LearningHub from '../../family/LearningHub'
import Cook from './Cook'
import MedCard from './MedCard'
import Meds from './Meds'
import Recipe from './Recipe'
import Recipes from './Recipes'
import { RECIPES } from './data'
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

interface LearnTile { id: string; hue: Hue; icon: IconName; label: string; value: string; href: string }

/** Discover > Learn. Routes: #discover/learn, /meds, /med/<id>, /recipes, /recipe/<id>, /cook/<id>, /together, /benefits (and /library, drawn by the Discover screen). */
export default function Screen() {
  const [medcards] = useKv<boolean>(MEDCARDS_FLAG, false)
  const [, , view, id] = useHash().replace(/^#/, '').split('/')
  if (view === 'recipes') return <Recipes />
  if (view === 'recipe' && id) return <Recipe id={id} />
  if (view === 'cook' && id) return <Cook id={id} />
  if (medcards && view === 'meds') return <Meds />
  if (medcards && view === 'med' && id) return <MedCard id={id} />
  if (view === 'together') return (
    <div className="lr">
      <SubHeader title="Learn together" backHref={ROOT} backLabel="Back to Learn" />
      <LearningHub />
    </div>
  )
  if (view === 'benefits') return (
    <div className="lr" data-testid="benefits">
      <SubHeader title="Your benefits" backHref={ROOT} backLabel="Back to Learn" />
      {BENEFITS.map((b) => (
        <a key={b.id} className="card press lr-tile" href={b.url} target="_blank" rel="noopener noreferrer">
          <span className="lr-grow"><b className="sh-h2">{b.title}</b><span className="sub">{b.body}</span><span className="dc-src">Source: {b.source}, checked <span className="nw">{b.checked}</span></span></span>
          <Icon name="out" />
          <span className="dc-sr">Opens outside the app</span>
        </a>
      ))}
    </div>
  )
  // The Medicine wiki tile waits for the clinician's sign-off flag; without it three tiles remain and the last one takes the full row.
  const tiles: LearnTile[] = [
    ...(medcards ? [{ id: 'meds', hue: 'green' as Hue, icon: 'pill' as IconName, label: 'Medicine wiki', value: 'What each medicine is for', href: ROOT + '/meds' }] : []),
    { id: 'recipes', hue: 'amber', icon: 'meal', label: 'Recipes', value: `${RECIPES.length} low-salt recipes`, href: ROOT + '/recipes' },
    { id: 'library', hue: 'amber', icon: 'file', label: 'Library', value: 'Plain reads on health topics', href: ROOT + '/library' },
    { id: 'together', hue: 'green', icon: 'users', label: 'Learn together', value: 'Short lessons to share', href: ROOT + '/together' }
  ]
  return (
    <div className="lr" data-testid="learn-home">
      <div className={`dc-tiles${tiles.length % 2 ? ' dc-odd' : ''}`}>
        {tiles.map((t) => <Tile key={t.id} hue={t.hue} icon={t.icon} label={t.label} value={t.value} href={t.href} testId={'learn-' + t.id} />)}
        <div className="dc-wide"><Tile hue="terra" icon="shield" label="Your benefits" value="PhilHealth Konsulta · Senior ID" href={ROOT + '/benefits'} testId="learn-benefits" /></div>
      </div>
      <div className="dc-jackrow">
        <JackArt name="reading" size={56} decorative />
        <p className="sub">Pick something to read together.</p>
      </div>
    </div>
  )
}
