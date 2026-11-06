import { useEffect } from 'react'
import { LargeTitle } from '../look/LargeTitle'
import { CALM_JACK_EVENT } from './CalmJack'
import CalmHero from './CalmHero'
import CrisisCard from './CrisisCard'
import MediaLinks from './MediaLinks'
import MoodCheck from './MoodCheck'
import './calm.css'

/** #calm: the Calm page pushed under Today (v13 lane C). Its header Ask Jack is the only Jack entry here (the shell button is off on own-header routes); it only asks CalmJack (App level) to open. */
export default function CalmScreen() {
  useEffect(() => { // #calm/listen (the Today radio row) opens at Listen and watch
    if (location.hash === '#calm/listen') document.querySelector('[data-testid="calm-media"]')?.scrollIntoView?.({ block: 'start' })
    else document.querySelector('.bt .scroll')?.scrollTo?.(0, 0)
  }, []) // #today and #calm are both tab index 0, so App does not reset the scroll
  return (
    <div className="cm cm-root" data-testid="calm" data-contrast-bg="#0E1B3A">
      <LargeTitle back={{ href: '#today', label: 'Today' }} title="Calm" actions={<button type="button" className="cm-ask" aria-haspopup="dialog" onClick={() => window.dispatchEvent(new Event(CALM_JACK_EVENT))}>Ask Jack</button>} />
      <CalmHero />
      <MoodCheck />
      <MediaLinks />
      <CrisisCard />
    </div>
  )
}
