import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AuthGate } from './features/auth/AuthGate'
import WebShell from './features/admin/desk/WebShell'
import './styles/tokens.css'

// The web admin (bantay.pages.dev/admin): same sign-in and data rules as the app, none of the phone shell.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthGate><WebShell /></AuthGate>
  </StrictMode>
)
