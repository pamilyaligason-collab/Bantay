import { useEffect, useState } from 'react'
import { enableAlerts, kvGet, kvSet, reAskDue } from './alerts'

/** Gentle re-ask when alerts are off. Appears at most once every 3 days. Drop it at the top of Today. */
export default function AlertsBanner() {
  const [show, setShow] = useState(false)
  const [blocked, setBlocked] = useState(false)
  useEffect(() => {
    if (typeof Notification === 'undefined' || Notification.permission === 'granted') return
    kvGet<number>('alerts.bannerShown').then((last) => {
      if (!reAskDue(last, Date.now())) return
      kvSet('alerts.bannerShown', Date.now())
      setShow(true)
    })
  }, [])
  if (!show) return null
  return (
    <div className="grp" role="region" aria-label="Alerts are off" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <strong>Alerts are off on this phone</strong>
      <span className="sub">You won’t hear about storms or missed medicines until you open Bantay.</span>
      {blocked && <span className="sub">Your phone is blocking alerts for Bantay. Turn them on in your phone settings.</span>}
      <button
        className="btn"
        onClick={async () => {
          const r = await enableAlerts()
          if (r === 'granted') setShow(false)
          else setBlocked(true)
        }}
      >
        Turn on alerts
      </button>
    </div>
  )
}
