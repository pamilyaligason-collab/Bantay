import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './native/links'
import './features/auth/nativeOAuth'
import { AuthGate } from './features/auth/AuthGate'
import { OnboardingGate } from './screens/Onboarding'
import './styles/tokens.css'
import './styles/app.css'
import './styles/glass.css'
import './styles/narrow.css'
import { installErrorLogging } from './features/monitor/errors'

installErrorLogging() // hashed client error counter (S8); no stack, no URL, no values

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthGate><OnboardingGate><App /></OnboardingGate></AuthGate>
  </StrictMode>
)
