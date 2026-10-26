import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  native: true, plugin: true, state: 'granted' as 'granted' | 'denied', placed: true, throws: false,
  call: vi.fn(), check: vi.fn(), request: vi.fn()
}))
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => h.native, isPluginAvailable: () => h.plugin },
  registerPlugin: () => ({
    call: (o: unknown) => { h.call(o); if (h.throws) throw new Error('boom'); return Promise.resolve({ placed: h.placed }) },
    checkPermission: () => { h.check(); return Promise.resolve({ state: h.state }) },
    requestPermission: () => { h.request(); return Promise.resolve({ state: 'granted' }) }
  })
}))
import { callFirstContact, callPermission, requestCallPermission } from './call'

const ana = { name: 'Ana', phone: '0917 123 4567' }
let hrefs: string[]
beforeEach(() => {
  Object.assign(h, { native: true, plugin: true, state: 'granted', placed: true, throws: false })
  h.call.mockClear(); h.check.mockClear(); h.request.mockClear()
  hrefs = []
  Object.defineProperty(window, 'location', { configurable: true, value: { set href(v: string) { hrefs.push(v) }, get href() { return '' } } })
})

describe('callPermission / requestCallPermission', () => {
  it('is unavailable on the web, on an old shell with no Call plugin, and never prompts', async () => {
    h.native = false
    expect(await callPermission()).toBe('unavailable')
    expect(await requestCallPermission()).toBe('unavailable')
    h.native = true; h.plugin = false
    expect(await callPermission()).toBe('unavailable')
    expect(h.check).not.toHaveBeenCalled()
    expect(h.request).not.toHaveBeenCalled()
  })
  it('callPermission only checks; requestCallPermission is the only prompt', async () => {
    h.state = 'denied'
    expect(await callPermission()).toBe('denied')
    expect(h.request).not.toHaveBeenCalled()
    expect(await requestCallPermission()).toBe('granted')
    expect(h.request).toHaveBeenCalledTimes(1)
  })
})

describe('callFirstContact', () => {
  it('no contact with a number: via none, nothing dialled', async () => {
    expect(await callFirstContact([])).toEqual({ placed: false, via: 'none' })
    expect(await callFirstContact([{ name: 'X', phone: '12' }])).toEqual({ placed: false, via: 'none' })
    expect(hrefs).toEqual([])
    expect(h.call).not.toHaveBeenCalled()
  })
  it('granted: the native plugin places the call to the first usable contact (digits only), no dial screen', async () => {
    expect(await callFirstContact([{ name: 'X', phone: '12' }, ana])).toEqual({ placed: true, via: 'native' })
    expect(h.call).toHaveBeenCalledWith({ number: '09171234567' })
    expect(hrefs).toEqual([])
  })
  it('permission missing: the prefilled dial screen and NO prompt', async () => {
    h.state = 'denied'
    expect(await callFirstContact([ana])).toEqual({ placed: false, via: 'tel' })
    expect(hrefs).toEqual(['tel:09171234567'])
    expect(h.call).not.toHaveBeenCalled()
    expect(h.request).not.toHaveBeenCalled()
  })
  it('PWA or old shell: the dial screen', async () => {
    h.native = false
    expect(await callFirstContact([ana])).toEqual({ placed: false, via: 'tel' })
    expect(hrefs).toEqual(['tel:09171234567'])
    h.native = true; h.plugin = false; hrefs.length = 0
    expect(await callFirstContact([ana])).toEqual({ placed: false, via: 'tel' })
    expect(hrefs).toEqual(['tel:09171234567'])
  })
  it('a native refusal (placed false) or a throw falls back to the dial screen', async () => {
    h.placed = false
    expect(await callFirstContact([ana])).toEqual({ placed: false, via: 'tel' })
    h.throws = true; hrefs.length = 0
    expect(await callFirstContact([ana])).toEqual({ placed: false, via: 'tel' })
    expect(hrefs).toEqual(['tel:09171234567'])
  })
  it('911 is never auto-dialled: emergency always opens tel:911 and never touches the plugin, even when permission is granted', async () => {
    expect(await callFirstContact([ana], { emergency: true })).toEqual({ placed: false, via: 'tel' })
    expect(hrefs).toEqual(['tel:911'])
    expect(h.call).not.toHaveBeenCalled()
    expect(h.check).not.toHaveBeenCalled()
  })
})
