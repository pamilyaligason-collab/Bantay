import { Component, type ErrorInfo, type ReactNode } from 'react'

/** Catches a render error or a failed lazy chunk in the routed screen, so the tab bar, Jack and SOS stay up. Moving to another screen (resetKey) clears it. */
export class ScreenBoundary extends Component<{ children: ReactNode; resetKey?: string }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(_e: Error, _i: ErrorInfo) { /* the hashed error counter (monitor/errors.ts) already hears window errors */ }
  componentDidUpdate(prev: { resetKey?: string }) { if (this.state.failed && prev.resetKey !== this.props.resetKey) this.setState({ failed: false }) }
  render() {
    if (!this.state.failed) return this.props.children
    return (
      <section className="card" role="alert" style={{ margin: 16, padding: 16 }}>
        <h2 style={{ margin: '0 0 8px' }}>This page did not load</h2>
        <p>Something went wrong here. Reload to try again. The tab bar and the help button still work.</p>
        <button type="button" className="btn" onClick={() => location.reload()}>Reload</button>
      </section>
    )
  }
}

const RELOADED = 'preloadReloaded'
/** A new deploy removes old chunk files: a lazy import then fails with vite:preloadError. Reload once to pick up the new build; the sessionStorage flag stops a loop. */
export function reloadOnPreloadError(): () => void {
  const on = () => {
    try { if (sessionStorage.getItem(RELOADED)) return; sessionStorage.setItem(RELOADED, '1') } catch { return }
    location.reload()
  }
  window.addEventListener('vite:preloadError', on)
  return () => window.removeEventListener('vite:preloadError', on)
}
