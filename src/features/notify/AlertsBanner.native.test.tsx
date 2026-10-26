import 'fake-indexeddb/auto'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { native } = vi.hoisted(() => ({ native: { v: true } }))
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => native.v } }))
import AlertsBanner, { NATIVE_NOTICE } from './AlertsBanner'

afterEach(cleanup)

describe('AlertsBanner on the Android app (D-78 interim)', () => {
  it('says family alerts do not reach the app yet and never offers a push toggle', () => {
    native.v = true
    render(<AlertsBanner />)
    expect(NATIVE_NOTICE).toBe('Family alerts do not reach the Android app yet. Keep the browser app for missed-dose and storm alerts.')
    expect(screen.getByText(NATIVE_NOTICE)).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
  })
  it('browser: no notice', () => {
    native.v = false
    render(<AlertsBanner />)
    expect(screen.queryByText(NATIVE_NOTICE)).toBeNull()
  })
})
