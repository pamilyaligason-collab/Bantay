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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthGate><OnboardingGate><App /></OnboardingGate></AuthGate>
  </StrictMode>
)
