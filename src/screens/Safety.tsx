import { useEffect, useState } from 'react'
import SafetyHome from '../features/safety/SafetyHub'
import { FirstAidPage, topicOf } from '../features/safety/FirstAid'
import Cpr from '../features/safety/Cpr'
import SafetySub, { subOf } from '../features/safety/SafetyPages'
import GoBag from '../features/gobag/GoBag'
import MedicalId from '../features/medid/MedicalId'
import { useWeatherPlace } from '../features/weather/weatherPlace'
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
  const { l, place } = useWeatherPlace() // D-163: the Weather screen's place rule (6 h fix drop, zone pick wins), so Safety forecasts where Today and Weather do
  const sub = subOf(hash)
  const fa = topicOf(hash)
  if (hash === '#safety/firstaid/cpr') return <Cpr />
  if (fa) return <FirstAidPage topic={fa} />
  return sub ? <SafetySub sub={sub} l={l} place={place} /> : <SafetyHome l={l} place={place} />
}
