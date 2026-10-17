import AlertsBanner from '../features/notify/AlertsBanner'
import NewsTop5 from '../features/safety/NewsTop5'
import SafetyBrief from '../features/safety/SafetyBrief'

const date = new Date().toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric' })

export default function Today() {
  return (
    <>
      <div className="hdr">
        <h1>Today</h1>
        <span>{date}.</span>
      </div>
      <AlertsBanner />
      <SafetyBrief limit={1} />
      <section aria-labelledby="t-news"><h2 id="t-news" className="hd">News</h2><NewsTop5 /></section>
    </>
  )
}
