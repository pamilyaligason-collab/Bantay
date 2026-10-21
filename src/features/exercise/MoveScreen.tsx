import { SubHeader } from '../shell/SubHeader'
import MovePanel from './MovePanel'

/** Health > Move (#health/move). */
export default function MoveScreen() {
  return (
    <>
      <SubHeader title="Move" backHref="#health" backLabel="Back to Health" />
      <MovePanel />
    </>
  )
}
