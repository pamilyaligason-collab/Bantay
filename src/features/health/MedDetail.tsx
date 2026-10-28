import { SubHeader } from '../shell/SubHeader'

/** One medicine (#health/med/<id>, mockup v7 health-meddetail). Session 13 lane M builds it out. */
export default function MedDetail({ medicationId }: { medicationId: string }) {
  return <SubHeader title="Medicine" backHref="#health/meds" key={medicationId} />
}
