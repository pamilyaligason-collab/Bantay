import 'fake-indexeddb/auto'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { native } = vi.hoisted(() => ({ native: { v: true } }))
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => native.v } }))
import AlertsBanner, { NATIVE_NOTICE } from './AlertsBanner'

afterEach(cleanup)

describe('AlertsBanner on the Android app (D-78)', () => {
  it('says family alerts show in Bantay when it is open, never promises a push, and never offers a push toggle', () => {
    native.v = true
    render(<AlertsBanner />)
    expect(NATIVE_NOTICE).toBe('Family alerts show here when you open Bantay.')
    expect(NATIVE_NOTICE).not.toMatch(/notif|push|lock screen|will be (told|notified)/i)
    expect(screen.getByText(NATIVE_NOTICE)).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
  })
  it('browser: no notice', () => {
    native.v = false
    render(<AlertsBanner />)
    expect(screen.queryByText(NATIVE_NOTICE)).toBeNull()
  })
})
