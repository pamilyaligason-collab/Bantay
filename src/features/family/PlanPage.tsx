import { SubHeader } from '../shell/SubHeader'
import Plan from './Plan'

/** #family/plan: Plan only (S24 split of the old Plan and calendar page). */
export default function PlanPage() {
  return (<><SubHeader title="Plan" backHref="#family" backLabel="Back to Family" /><Plan /></>)
}
