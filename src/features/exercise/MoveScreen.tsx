import { JackArt } from '../look'
import { SubHeader } from '../shell/SubHeader'
import MovePanel from './MovePanel'

/** Health > Move (#health/move). */
export default function MoveScreen() {
  return (
    <>
      <SubHeader title="Move" backHref="#health" backLabel="Back to Health" />
      <div className="mv-page"><div className="s14j-art"><JackArt name="walking" size={96} /></div><MovePanel /></div>
    </>
  )
}
