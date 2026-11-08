import { SubHeader } from '../shell/SubHeader'
import Calendar from './Calendar'

/** #family/calendar: Calendar only. */
export default function CalendarPage() {
  return (<><SubHeader title="Calendar" backHref="#family" backLabel="Back to Family" /><Calendar /></>)
}
