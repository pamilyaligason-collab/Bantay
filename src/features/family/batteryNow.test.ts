import { afterEach, describe, expect, it } from 'vitest'
import { batteryNow } from './batteryNow'

const set = (v: unknown) => Object.defineProperty(navigator, 'getBattery', { value: v, configurable: true })
afterEach(() => { delete (navigator as unknown as Record<string, unknown>).getBattery })

describe('batteryNow', () => {
  it('reads level as a whole percent and the charging flag', async () => {
    set(() => Promise.resolve({ level: 0.184, charging: true }))
    expect(await batteryNow()).toEqual({ pct: 18, charging: true })
  })
  it('is null (unknown, not 0) when unsupported, throwing, or odd', async () => {
    expect(await batteryNow()).toBeNull()
    set(() => Promise.reject(new Error('blocked')))
    expect(await batteryNow()).toBeNull()
    set(() => Promise.resolve({ level: 7, charging: false }))
    expect(await batteryNow()).toBeNull()
    set(() => Promise.resolve({ level: 0, charging: false }))
    expect(await batteryNow()).toEqual({ pct: 0, charging: false })
  })
})
