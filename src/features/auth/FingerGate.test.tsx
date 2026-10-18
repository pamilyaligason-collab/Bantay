import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ prompt: vi.fn(), mode: vi.fn(), enrol: vi.fn() }))
vi.mock('./biometric', () => ({ promptFingerprint: h.prompt, unlockMode: h.mode, openFingerprintEnrol: h.enrol }))
import { FingerOffer, LockScreen } from './FingerGate'

beforeEach(() => { localStorage.clear(); h.prompt.mockReset(); h.mode.mockReset(); h.enrol.mockReset() })
afterEach(() => cleanup())

describe('LockScreen', () => {
  it('prompts at once and opens the app on success', async () => {
    h.prompt.mockResolvedValue(true)
    const onUnlocked = vi.fn()
    render(<LockScreen name="Mama" onUnlocked={onUnlocked} onUsePin={() => {}} onNotYou={() => {}} />)
    await waitFor(() => expect(onUnlocked).toHaveBeenCalledTimes(1))
    expect(h.prompt).toHaveBeenCalledTimes(1)
  })
  it('on a miss stays locked and offers PIN and Not you', async () => {
    h.prompt.mockResolvedValue(false)
    const onUnlocked = vi.fn(), onUsePin = vi.fn(), onNotYou = vi.fn()
    render(<LockScreen name="Mama" onUnlocked={onUnlocked} onUsePin={onUsePin} onNotYou={onNotYou} />)
    expect((await screen.findByRole('status')).textContent).toMatch(/did not work/)
    fireEvent.click(screen.getByRole('button', { name: 'Use PIN' }))
    fireEvent.click(screen.getByRole('button', { name: 'Not you?' }))
    expect(onUnlocked).not.toHaveBeenCalled()
    expect(onUsePin).toHaveBeenCalledTimes(1); expect(onNotYou).toHaveBeenCalledTimes(1)
  })
})

describe('LockScreen negative button', () => {
  it("'use_pin' opens the PIN pad at once, no second tap", async () => {
    h.prompt.mockResolvedValue('use_pin')
    const onUsePin = vi.fn()
    render(<LockScreen name="Mama" onUnlocked={() => {}} onUsePin={onUsePin} onNotYou={() => {}} />)
    await waitFor(() => expect(onUsePin).toHaveBeenCalledTimes(1))
  })
})

describe('FingerOffer', () => {
  it('turns the fingerprint on after a successful prompt', async () => {
    h.mode.mockResolvedValue('fingerprint'); h.prompt.mockResolvedValue(true)
    const onDone = vi.fn()
    render(<FingerOffer personId="p1" onDone={onDone} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Turn on fingerprint' }))
    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(localStorage.getItem('bantay.passkey.p1')).toBe('1')
  })
  it('nothing enrolled: says so and opens Settings, or uses PIN each time', async () => {
    h.mode.mockResolvedValue('enrol-first')
    const onDone = vi.fn()
    render(<FingerOffer personId="p1" onDone={onDone} />)
    expect(await screen.findByText('Set up a fingerprint in Settings first.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Open Settings' }))
    expect(h.enrol).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Use PIN each time' }))
    expect(onDone).toHaveBeenCalled()
    expect(localStorage.getItem('bantay.passkey.p1')).toBeNull()
  })
  it('no sensor: skips itself', async () => {
    h.mode.mockResolvedValue('pin')
    const onDone = vi.fn()
    render(<FingerOffer personId="p1" onDone={onDone} />)
    await waitFor(() => expect(onDone).toHaveBeenCalled())
  })
})
