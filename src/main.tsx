import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { OnboardingGate } from './screens/Onboarding'
import './styles/tokens.css'
import './styles/app.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <OnboardingGate><App /></OnboardingGate>
  </StrictMode>
)
