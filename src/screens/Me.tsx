import { useEffect, useState, type ReactElement } from 'react'
import AboutGroup from '../features/settings/AboutGroup'
import AlertsGroup from '../features/settings/AlertsGroup'
import DisplayGroup from '../features/settings/DisplayGroup'
import FamilyGroup from '../features/settings/FamilyGroup'
import Overview from '../features/settings/Overview'
import PhoneGroup from '../features/settings/PhoneGroup'
import SigninGroup from '../features/settings/SigninGroup'

// Settings (S16 L5): #me is the overview, #me/<group> a group page that draws its own Back + title. What the family can see is the server list at #sharing (D-80).
const GROUPS: Record<string, () => ReactElement> = { alerts: AlertsGroup, display: DisplayGroup, family: FamilyGroup, phone: PhoneGroup, signin: SigninGroup, about: AboutGroup }

export default function Me() {
  const [hash, setHash] = useState(() => location.hash)
  useEffect(() => {
    const on = () => setHash(location.hash)
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  const key = hash.replace(/^#me\/?/, '').split(/[/?]/)[0] ?? ''
  const Screen = Object.hasOwn(GROUPS, key) ? GROUPS[key]! : Overview // an unknown group lands on the overview
  return <Screen />
}
