import { afterEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ open: vi.fn() }))
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true } }))
vi.mock('@capacitor/browser', () => ({ Browser: { open: m.open } }))

const tick = () => new Promise((r) => setTimeout(r, 0))
const click = () => {
  const a = document.createElement('a')
  a.setAttribute('href', 'https://example.org/page')
  document.body.append(a)
  a.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
  a.remove()
}

describe('native link opener (plugin missing)', () => {
  afterEach(() => { vi.restoreAllMocks(); m.open.mockReset() })

  it('a rejected Browser plugin falls back to window.open and leaves no unhandled rejection', async () => {
    const seen: unknown[] = []
    const onRej = (e: unknown) => seen.push(e)
    process.on('unhandledRejection', onRej)
    const win = vi.spyOn(window, 'open').mockReturnValue(null)
    m.open.mockRejectedValue(new Error('"Browser" plugin is not implemented on android'))
    await import('./links')
    click()
    await tick(); await tick()
    process.off('unhandledRejection', onRej)
    expect(win).toHaveBeenCalledWith('https://example.org/page', '_blank', 'noopener')
    expect(seen).toEqual([])
  })

  it('a working plugin opens the link in the in-app browser and not in a tab', async () => {
    const win = vi.spyOn(window, 'open').mockReturnValue(null)
    m.open.mockResolvedValue(undefined)
    click()
    await tick()
    expect(m.open).toHaveBeenCalledWith({ url: 'https://example.org/page' })
    expect(win).not.toHaveBeenCalled()
  })
})
