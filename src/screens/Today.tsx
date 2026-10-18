import ChecklistCard from '../features/setup/ChecklistCard'
import AlertsBanner from '../features/notify/AlertsBanner'
import NewsTop5 from '../features/safety/NewsTop5'
import SafetyBrief from '../features/safety/SafetyBrief'
import MovementCard from '../features/sensors/MovementCard'
import QuickWalk from '../features/sensors/QuickWalk'
import { PwaBanner } from '../features/update/PwaBanner'

const date = new Date().toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric' })

export default function Today() {
  return (
    <>
      <PwaBanner />
      <div className="hdr">
        <h1>Today</h1>
        <span>{date}.</span>
      </div>
      <ChecklistCard />
      <AlertsBanner />
      <SafetyBrief limit={1} />
      <MovementCard />
      <QuickWalk />
      <section aria-labelledby="t-news"><h2 id="t-news" className="hd">News</h2><NewsTop5 /></section>
    </>
  )
}
