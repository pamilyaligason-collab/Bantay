import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AuthGate } from './features/auth/AuthGate'
import WebShell, { ShellSkeleton } from './features/admin/desk/WebShell'
import './styles/tokens.css'
import { installErrorLogging } from './features/monitor/errors'

installErrorLogging() // hashed client error counter (S8); no stack, no URL, no values

// The web admin (bantay.pages.dev/admin): same sign-in and data rules as the app, none of the phone shell.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthGate fallback={<ShellSkeleton />}><WebShell /></AuthGate>
  </StrictMode>
)
