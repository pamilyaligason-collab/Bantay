import tokens from '../styles/tokens.css?raw'
import { beforeEach, describe, expect, it } from 'vitest'

// uPlot calls matchMedia at import time and jsdom has none.
window.matchMedia = (() => ({ matches: false, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia
const { chartColors } = await import('./chart')

beforeEach(() => {
  document.head.innerHTML = ''
  document.documentElement.removeAttribute('data-theme')
  const s = document.createElement('style')
  s.textContent = tokens
  document.head.append(s)
})

describe('chartColors', () => {
  it('resolves the validated chart pair from the light tokens', () => {
    const c = chartColors()
    expect(c.c1).toBe('#2B6CC4')
    expect(c.c2).toBe('#C2610F')
  })

  it('follows the dark theme override', () => {
    document.documentElement.setAttribute('data-theme', 'dark')
    const c = chartColors()
    expect(c.c1).toBe('#5B95E0')
    expect(c.c2).toBe('#C9772A')
  })
})
