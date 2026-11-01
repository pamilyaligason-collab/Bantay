import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { loadFamily } from '../auth/family'
import { getMember } from '../auth/session'
import { JackSheet } from '../shell/JackSheet'
import { firstName } from '../shell/TopBar'
import SosScreen from '../sos/SosScreen'

/** Dispatched by the Calm header's Ask Jack. */
export const CALM_JACK_EVENT = 'calm:jack'

/** The Jack sheet and the full SOS screen for #calm, mounted once at App level next to JackFab (JackSheet and SosScreen are already eager there).
 *  An SOS must outlive the routed page: Back or a hash change must not unmount it. The sheet itself closes when the user leaves #calm. */
export default function CalmJack() {
  const [jack, setJack] = useState(false)
  const [sos, setSos] = useState(false)
  const [name, setName] = useState('')
  const opener = useRef<HTMLElement | null>(null)
  useEffect(() => {
    const on = () => { opener.current = document.activeElement as HTMLElement | null; setJack(true) }
    const leave = () => { if (location.hash !== '#calm') setJack(false) }
    window.addEventListener(CALM_JACK_EVENT, on)
    window.addEventListener('hashchange', leave)
    return () => { window.removeEventListener(CALM_JACK_EVENT, on); window.removeEventListener('hashchange', leave) }
  }, [])
  useEffect(() => {
    if (!jack) return
    let live = true
    void getMember().then((m) => {
      const n = m?.personId ? loadFamily().find((f) => f.personId === m.personId)?.displayName : ''
      if (live && n) setName(n)
    })
    return () => { live = false }
  }, [jack])
  return (
    <>
      {jack && <JackSheet onClose={() => { setJack(false); (opener.current?.isConnected ? opener.current : document.querySelector<HTMLElement>('.cm-ask'))?.focus() }} onSos={() => { setJack(false); setSos(true) }} firstName={firstName(name)} />}
      {sos && createPortal(<div className="sh-sosfull" data-testid="sos-full"><SosScreen onClose={() => setSos(false)} /></div>, document.querySelector('.bt') ?? document.body)}
    </>
  )
}
