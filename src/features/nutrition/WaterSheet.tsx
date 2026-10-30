import { useState } from 'react'
import { useActingCan, useActingPersonId } from '../viewas/viewAs'
import { useGoal, useWater } from './hooks'
import WaterPanel from './WaterPanel'
import './nutrition.css'

/** The Water sheet from the quick log: today's total and one big +250 ml button. */
export default function WaterSheet() {
  const personId = useActingPersonId() ?? ''
  const can = useActingCan() // while acting without log rights the button is off and the reason shows
  const rows = useWater(personId, 2)
  const goal = useGoal(personId)
  const [now] = useState(() => new Date())
  return (
    <div className="nu">
      <p className="nu-line">One tap is one glass, 250 ml.</p>
      <WaterPanel rows={rows} goalMl={goal.waterMl} now={now} personId={personId} canAdd={!can || can.log} />
      {can && !can.log && can.reason && <p className="nu-sub">{can.reason}</p>}
    </div>
  )
}
