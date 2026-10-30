import { JackArt } from '../look'
import { Row } from '../look/Row'
import { SubHeader } from '../shell/SubHeader'
import { useActing } from '../viewas/viewAs'
import MovePanel from './MovePanel'

/** Move logs are yours only (M2-2): while acting as someone the Done button is off and says why. Gating only; the log itself still writes through exercise/actions.ts for the signed-in person. */
export const MOVE_LOCK = 'Move logs are yours only. Exit to log.'

/** Health > Move (#health/move), with the door to Food and salt beneath it (the More tile is "Move & food"). */
export default function MoveScreen() {
  const { acting } = useActing()
  return (
    <>
      <SubHeader title="Move" backHref="#health" backLabel="Back to Health" />
      <div className="mv-page"><div className="s14j-art"><JackArt name="walking" size={96} /></div><MovePanel lockLog={acting ? MOVE_LOCK : undefined} /></div>
      <Row icon="meal" title="Food and salt" sub="Meals, salt and nutrients" href="#health/nutrition" testId="food-door" />
    </>
  )
}
