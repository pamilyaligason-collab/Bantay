import { SystemBarsStyle } from '@capacitor/core'
import { describe, expect, it } from 'vitest'
import { applyTheme, barStyle } from './theme'

describe('theme', () => {
  it('status-bar icons follow the app theme, not the phone', () => {
    expect(barStyle('light')).toBe(SystemBarsStyle.Light)
    expect(barStyle('dark')).toBe(SystemBarsStyle.Dark)
    expect(barStyle('system')).toBe(SystemBarsStyle.Default)
  })
  it('applyTheme sets and clears data-theme without throwing in a browser', () => {
    applyTheme('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
    applyTheme('system')
    expect(document.documentElement.dataset.theme).toBeUndefined()
  })
})
