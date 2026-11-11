import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './native/links'
import './features/auth/nativeOAuth'
import './features/setup/all/deepLink' // S31: ph.bantay.family://setup opens #setup/all
import { AuthGate } from './features/auth/AuthGate'
import { OnboardingGate } from './screens/Onboarding'
import './styles/tokens.css'
import './styles/app.css'
import './styles/glass.css'
import './styles/numfont.css'
import './styles/narrow.css'
import './styles/safearea.css'
import { reloadOnPreloadError } from './features/shell/ScreenBoundary'
import { watchNarrow } from './styles/narrowMode'
import { installErrorLogging } from './features/monitor/errors'
import { initZone, setSelf } from './features/time/zone'
import { getLastPerson } from './features/auth/family'

setSelf(getLastPerson()) // the person this phone belongs to, until the server says (their clock is this phone's zone)
initZone() // S30 L8: own dose days and quiet hours follow this phone's zone (Asia/Manila until now)
void import('./features/time/reportZone').then((m) => m.loadPersonZones()).catch(() => {}) // the cached zones of the family, for the (their time) labels
reloadOnPreloadError() // a failed lazy chunk after a deploy: one reload
watchNarrow() // 200% text on the phone: see narrowMode.ts
void import('./features/family/bgPlace').then((m) => m.bgPlaceStart()).catch(() => {}) // D-150: background place update watchers from app start (APK 2.8.0+ only; a no-op on web)
installErrorLogging() // hashed client error counter (S8); no stack, no URL, no values

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthGate><OnboardingGate><App /></OnboardingGate></AuthGate>
  </StrictMode>
)
