import { SystemBarsStyle } from '@capacitor/core'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { setStyle } = vi.hoisted(() => ({ setStyle: vi.fn(() => Promise.resolve()) }))
vi.mock('@capacitor/core', () => ({ SystemBars: { setStyle }, SystemBarsStyle: { Dark: 'DARK', Light: 'LIGHT', Default: 'DEFAULT' } }))

import { applyTheme, stopWatchingSystem } from './theme'

function fakeMedia(matches: boolean) {
  const subs = new Set<() => void>()
  const q = { matches, addEventListener: (_: string, f: () => void) => subs.add(f), removeEventListener: (_: string, f: () => void) => subs.delete(f) }
  vi.stubGlobal('matchMedia', () => q)
  return { subs, flip: (m: boolean) => { q.matches = m; subs.forEach((f) => f()) } }
}
const last = () => (setStyle.mock.calls.at(-1) as unknown as [{ style: string }])[0].style

afterEach(() => { stopWatchingSystem(); setStyle.mockClear(); vi.unstubAllGlobals() })

describe('theme and status-bar icons', () => {
  it('pinned light/dark set data-theme and the matching style, whatever the phone is', () => {
    fakeMedia(true)
    applyTheme('light')
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(last()).toBe(SystemBarsStyle.Light)
    applyTheme('dark')
    expect(last()).toBe(SystemBarsStyle.Dark)
  })
  it('system follows the phone now and after a switch, and stops when pinned', () => {
    const m = fakeMedia(false)
    applyTheme('system')
    expect(document.documentElement.dataset.theme).toBeUndefined()
    expect(last()).toBe(SystemBarsStyle.Light)
    m.flip(true)
    expect(last()).toBe(SystemBarsStyle.Dark)
    applyTheme('light')
    expect(m.subs.size).toBe(0)
    const n = setStyle.mock.calls.length
    m.flip(false)
    expect(setStyle.mock.calls.length).toBe(n)
  })
})
