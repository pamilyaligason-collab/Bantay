import { describe, expect, it, vi } from 'vitest'

describe('Discover registration', () => {
  it('registers at once when the sub file is the first thing imported (cold deep link): no poll, no "soon" card', async () => {
    vi.resetModules()
    const { registerWhenReady } = await import('./register')
    const { subScreen } = await import('../registry')
    const Screen = () => null
    registerWhenReady('watch', Screen)
    expect(subScreen('watch')).toBe(Screen)
  })
  it('importing the discover index first (as the app does) registers Play and News in the end, without an unhandled TDZ error', async () => {
    vi.resetModules()
    const idx = await import('..')
    await vi.waitFor(() => { expect(idx.subScreen('play')).toBeTypeOf('function'); expect(idx.subScreen('news')).toBeTypeOf('function') }, { timeout: 40000 })
  }, 60000) // the import graph is large; under full-suite load it needs more than the 15 s default
})
