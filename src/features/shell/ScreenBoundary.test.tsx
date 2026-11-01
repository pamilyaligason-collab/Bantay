import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { reloadOnPreloadError, ScreenBoundary } from './ScreenBoundary'

afterEach(() => { cleanup(); sessionStorage.clear(); vi.restoreAllMocks() })
const Boom = (): never => { throw new Error('boom') }

describe('ScreenBoundary', () => {
  it('shows a plain message and a Reload button, and keeps what is outside it', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    render(<><nav>tabs</nav><ScreenBoundary><Boom /></ScreenBoundary></>)
    expect(screen.getByText('tabs')).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toContain('did not load')
    expect(screen.getByRole('button', { name: 'Reload' })).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toContain('open the Safety tab') // Jack is hidden in Simple mode and on some screens, so the message must not promise it
  })
  it('clears when the route key changes', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { rerender } = render(<ScreenBoundary resetKey="#a"><Boom /></ScreenBoundary>)
    rerender(<ScreenBoundary resetKey="#b"><p>fine</p></ScreenBoundary>)
    expect(screen.getByText('fine')).toBeTruthy()
  })
})

describe('reloadOnPreloadError', () => {
  it('reloads once, then never again in the same session', () => {
    const reload = vi.fn()
    vi.stubGlobal('location', { ...window.location, reload })
    const off = reloadOnPreloadError()
    window.dispatchEvent(new Event('vite:preloadError'))
    window.dispatchEvent(new Event('vite:preloadError'))
    expect(reload).toHaveBeenCalledTimes(1)
    off()
    vi.unstubAllGlobals()
  })
  it('does not reload while offline, and can still reload once back online', () => {
    const reload = vi.fn()
    vi.stubGlobal('location', { ...location, reload })
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    sessionStorage.clear()
    const stop = reloadOnPreloadError()
    window.dispatchEvent(new Event('vite:preloadError'))
    expect(reload).not.toHaveBeenCalled()
    online.mockReturnValue(true)
    window.dispatchEvent(new Event('vite:preloadError'))
    expect(reload).toHaveBeenCalledTimes(1)
    stop(); online.mockRestore(); vi.unstubAllGlobals()
  })

  it('does not reload while an SOS screen is up', () => {
    const reload = vi.fn()
    vi.stubGlobal('location', { ...window.location, reload })
    document.body.insertAdjacentHTML('beforeend', '<div class="sos-bare"></div>')
    const off = reloadOnPreloadError()
    window.dispatchEvent(new Event('vite:preloadError'))
    expect(reload).not.toHaveBeenCalled()
    off()
    document.querySelector('.sos-bare')?.remove()
    vi.unstubAllGlobals()
  })
})
