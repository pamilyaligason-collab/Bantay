import { SafetyHead } from '../safety/SafetyHead'

export default function World() {
  return (
    <>
      <SafetyHead view="world" />
      <p className="sf-empty">Coming in this lane</p>
    </>
  )
}
