import { useMemo } from 'react'
import { LargeTitle, Row } from '../look'
import { latestSteps } from '../health/stepsDay'
import { FoodBlock } from '../nutrition/MoveFoodRows'
import { useActivity } from '../health/useActivity'
import { properName } from '../health/medName'
import { useHealthPerson } from '../health/useHealthPerson'
import { WhoLine } from '../health/WhoLine'
import { useActing } from '../viewas/viewAs'
import MovePanel from './MovePanel'
import { MOVE_LOCK } from './recommend'

/** The phone's own step rows: the newest day that has any, null when none were ever synced (nothing is invented, and 0 is never shown for a day without data). */
function useSteps() {
  const { ownId } = useHealthPerson() // the phone's steps are the viewer's own, whoever the Health picker shows
  const acts = useActivity(ownId)
  return useMemo(() => latestSteps(acts), [acts])
}

/** Health > Move and food (#health/move): this week's move panel as the hero, then Steps and the door to Food and salt. */
export default function MoveScreen() {
  const { acting } = useActing()
  const steps = useSteps()
  const { personId, ownId, canMark, people } = useHealthPerson()
  return (
    <>
      <LargeTitle back={{ href: '#health', label: 'Health' }} title="Move and food" tone="teal" />
      <WhoLine />
      <div className="mv-page" data-hero><MovePanel lockLog={acting || personId !== ownId ? MOVE_LOCK : undefined} hideRing={personId !== ownId} /></div>
      <FoodBlock personId={personId} canMark={canMark} name={personId !== ownId ? properName(people.find((p) => p.id === personId)?.name ?? '') : undefined} />
      {personId === ownId && <Row icon="walk" tint="teal" title="Steps" sub={steps === null ? 'Connect your phone to count steps' : 'From your phone'} value={steps === null ? 'Not connected' : steps.today ? `${steps.total.toLocaleString('en-US')} steps today` : `${steps.total.toLocaleString('en-US')} on ${steps.day}`} href="#health/metric/steps" testId="steps-door" />}
      <Row icon="meal" title="Food and salt" sub="Meals, salt and nutrients" href="#health/nutrition" testId="food-door" />
    </>
  )
}
