import { useState } from 'react'
import { Icon } from '../../shell/Icon'
import { SubHeader } from '../../shell/SubHeader'
import { DAILY_SODIUM_MG, RECIPES, RECIPE_SOURCES, sodiumPerServing, type RecipeTag } from './data'

const FILTERS: { id: RecipeTag | 'all'; label: string }[] = [{ id: 'all', label: 'All' }, { id: 'lowsalt', label: 'Low salt' }, { id: 'diabetes', label: 'Diabetes-friendly' }, { id: 'soft', label: 'Soft food' }, { id: 'fish', label: 'Fish' }]

/** The salt bar: width is one serving over the 1,500 mg day, amber above 400 mg. */
export function SaltBar({ mg }: { mg: number }) {
  return <div className="lr-bar" role="img" aria-label={`${mg} mg sodium, ${Math.round((mg / DAILY_SODIUM_MG) * 100)} percent of a 1,500 mg day`}><i className={mg > 400 ? 'w' : ''} style={{ width: Math.min(100, (mg / DAILY_SODIUM_MG) * 100) + '%' }} /></div>
}

/** #discover/learn/recipes: 20 low salt Filipino recipes with the salt in one serving. */
export default function Recipes() {
  const [f, setF] = useState<RecipeTag | 'all'>('all')
  const list = RECIPES.filter((r) => f === 'all' || r.tags.includes(f))
  return (
    <div className="lr">
      <SubHeader title="Healthy recipes" backHref="#discover/learn" backLabel="Back to Learn" />
      <div className="lr-chips" role="group" aria-label="Filter recipes">
        {FILTERS.map((x) => <button key={x.id} type="button" className="chip lr-chip" aria-pressed={f === x.id} onClick={() => setF(x.id)}>{x.label}</button>)}
      </div>
      <p className="sub">The bar shows how much of a 1,500 mg sodium day one serving uses.</p>
      {list.map((r) => {
        const mg = sodiumPerServing(r)
        return (
          <a key={r.id} className="card lr-stack lr-dish" href={'#discover/learn/recipe/' + r.id} data-testid="recipe-card">
            <span className="lr-row"><span className="lr-grow"><b>{r.name}</b><span className="sub">{r.blurb}, {r.minutes} min</span></span><Icon name="chev" /></span>
            <span className="lr-row"><span className="sub lr-grow">Salt per serving</span><b>{mg} mg sodium</b></span>
            <SaltBar mg={mg} />
          </a>
        )
      })}
      <p className="lr-src">{RECIPE_SOURCES}</p>
    </div>
  )
}
