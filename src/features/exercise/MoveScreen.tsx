import { useMemo } from 'react'
import { JackArt, LargeTitle, Row } from '../look'
import { localDay } from '../health/model'
import { useActivity } from '../health/useActivity'
import { useHealthPerson } from '../health/useHealthPerson'
import { useActing } from '../viewas/viewAs'
import MovePanel from './MovePanel'

/** Move logs are yours only (M2-2): while acting as someone the Done button is off and says why. Gating only; the log itself still writes through exercise/actions.ts for the signed-in person. */
export const MOVE_LOCK = 'Move logs are yours only. Exit to log.'

/** Steps today from the phone's own step rows; null when none were ever synced (nothing is invented). */
function useStepsToday(): number | null {
  const { ownId } = useHealthPerson() // the phone's steps are the viewer's own, whoever the Health picker shows
  const acts = useActivity(ownId)
  return useMemo(() => {
    const rows = acts.filter((a) => a.kind === 'steps' && typeof a.steps === 'number')
    if (!rows.length) return null
    const today = localDay(new Date().toISOString())
    return rows.filter((a) => localDay(a.startedAt) === today).reduce((s, a) => s + (a.steps as number), 0)
  }, [acts])
}

/** Health > Move and food (#health/move): this week's move panel as the hero, then Steps and the door to Food and salt. */
export default function MoveScreen() {
  const { acting } = useActing()
  const steps = useStepsToday()
  return (
    <>
      <LargeTitle back={{ href: '#health', label: 'Health' }} title="Move and food" />
      <div className="mv-page" data-hero><div className="s14j-art"><JackArt name="walking" size={96} /></div><MovePanel lockLog={acting ? MOVE_LOCK : undefined} /></div>
      <Row icon="walk" tint="teal" title="Steps" sub={steps === null ? 'Connect your phone to count steps' : 'From your phone'} value={steps === null ? 'Not connected' : `${steps.toLocaleString('en-US')} steps today`} href="#health/metric/steps" testId="steps-door" />
      <Row icon="meal" title="Food and salt" sub="Meals, salt and nutrients" href="#health/nutrition" testId="food-door" />
    </>
  )
}
