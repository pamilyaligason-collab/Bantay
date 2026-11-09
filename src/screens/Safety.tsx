import { useEffect, useState } from 'react'
import SafetyHome from '../features/safety/SafetyHub'
import { FirstAidPage, topicOf } from '../features/safety/FirstAid'
import Cpr from '../features/safety/Cpr'
import SafetySub, { subOf } from '../features/safety/SafetyPages'
import GoBag from '../features/gobag/GoBag'
import MedicalId from '../features/medid/MedicalId'
import { useLocation, usePlaceFrom } from '../features/location/useLocation'
import '../features/safety/safety.css'

/** #medid and #gobag are sub-screens of this tab (routes.ts keeps the Safety tab lit); #safety/<page> are the hub pages (D-68). */
function useHash() {
  const [h, setH] = useState(location.hash)
  useEffect(() => {
    const on = () => setH(location.hash)
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return h
}

export default function Safety() {
  const h = useHash()
  return h === '#medid' || h.startsWith('#medid/') ? <MedicalId /> : h === '#gobag' ? <GoBag /> : <SafetyRoute hash={h} />
}

function SafetyRoute({ hash }: { hash: string }) {
  // Hotlines, maps and the abroad check follow the phone's real place; the forecast (RightNow) uses useWeatherPlace itself (D-163)
  const l = useLocation()
  const place = usePlaceFrom(l)
  const sub = subOf(hash)
  const fa = topicOf(hash)
  if (hash === '#safety/firstaid/cpr') return <Cpr />
  if (fa) return <FirstAidPage topic={fa} />
  return sub ? <SafetySub sub={sub} l={l} place={place} /> : <SafetyHome l={l} place={place} />
}
