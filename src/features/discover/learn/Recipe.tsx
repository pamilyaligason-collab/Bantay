import { Icon } from '../../shell/Icon'
import { SubHeader } from '../../shell/SubHeader'
import { DAILY_SODIUM_MG, RECIPE_SOURCES, recipe, sodiumPerServing, stepText } from './data'
import { SaltBar } from './Recipes'

/** #discover/learn/recipe/<id>: salt per serving, ingredients with swaps, steps, and the Cook mode button. */
export default function Recipe({ id }: { id: string }) {
  const r = recipe(id)
  if (!r) return <div className="lr"><SubHeader title="Healthy recipes" backHref="#discover/learn/recipes" backLabel="Back to recipes" /><p className="card sub">We do not have that recipe.</p></div>
  const mg = sodiumPerServing(r)
  return (
    <div className="lr" data-testid="recipe">
      <SubHeader title={r.name} backHref="#discover/learn/recipes" backLabel="Back to recipes" />
      <p className="lr-for">{r.blurb}. {r.servings} servings, {r.minutes} min.</p>
      <a className="sh-pill sh-primary sh-block" href={'#discover/learn/cook/' + r.id}><Icon name="play" size={20} />Cook mode</a>
      <div className="card lr-stack" data-testid="salt">
        <b>Salt per serving</b>
        <span className="lr-row"><b className="lr-grow lr-big">{mg} mg</b><span className="sub">of a {DAILY_SODIUM_MG.toLocaleString('en-US')} mg day</span></span>
        <SaltBar mg={mg} />
        <span className="sub">About {Math.round((mg / DAILY_SODIUM_MG) * 100)} percent.{r.usualMg ? ` The usual version is about ${r.usualMg} mg.` : ''} This is an estimate.</span>
      </div>
      <div className="card lr-list">
        <b>Ingredients and swaps</b>
        {r.ingredients.map(([t, , note]) => <div key={t} className="lr-line"><span className="lr-grow"><b>{t}</b>{note && <span className="sub">{note}</span>}</span></div>)}
      </div>
      <div className="card lr-stack"><b>Steps</b><ol className="lr-steps">{r.steps.map((s) => <li key={stepText(s)}>{stepText(s)}</li>)}</ol></div>
      <p className="lr-src">{RECIPE_SOURCES}</p>
    </div>
  )
}
