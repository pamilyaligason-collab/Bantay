import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ alarm: vi.fn(), display: true, track: vi.fn(async () => true) }))
vi.mock('../phonecheck/probe', () => ({ scheduleTestAlarm: h.alarm }))
vi.mock('../admin/events', () => ({ track: h.track }))
vi.mock('./steps', () => ({ notifyState: async () => ({ display: h.display, exact: true, battery: true }) }))
import FirstSuccessStep from './FirstSuccessStep'

const CONSENT = 'Your records stay private until you or a family admin share them and the person accepts. Family admins can see them. Change this in Settings > Family and sharing.'
const tick = async (ms: number) => { for (let t = 0; t < Math.max(ms, 1); t += 1000) await act(async () => { await vi.advanceTimersByTimeAsync(Math.min(1000, ms)) }) } // one second per render: each tick sets the next

beforeEach(() => { vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }); h.alarm.mockReset(); h.track.mockClear(); h.display = true })
afterEach(() => { cleanup(); vi.useRealTimers() })

describe('FirstSuccessStep (onboarding 5)', () => {
  it('schedules the test alarm for 5 s, counts down, then draws the check with the exact copy', async () => {
    h.alarm.mockResolvedValue('scheduled')
    const open = vi.fn()
    const rung = vi.fn()
    render(<FirstSuccessStep name="Mama" onRung={rung} onBackToReminders={() => undefined} onOpenToday={open} />)
    await tick(0)
    expect(screen.getByRole('heading', { name: "Let's test it." })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Send a test reminder' }))
    await tick(0)
    expect(h.alarm).toHaveBeenCalledWith(5)
    expect((screen.getByRole('button', { name: /Ringing in 5/ }) as HTMLButtonElement).disabled).toBe(true)
    await tick(4000)
    expect(screen.queryByText("It works. You're set, Mama.")).toBeNull()
    await tick(1000)
    expect(screen.getByRole('heading', { name: "It works. You're set, Mama." })).toBeTruthy()
    expect(screen.getByText(CONSENT)).toBeTruthy()
    expect(rung).toHaveBeenCalledTimes(1)
    expect(h.track).toHaveBeenCalledWith('action', 'onboard_test_rang')
    fireEvent.click(screen.getByRole('button', { name: 'Open Today' }))
    expect(open).toHaveBeenCalledTimes(1)
  })

  it('no permission: says to turn reminders on first and goes back to screen 3', async () => {
    h.alarm.mockResolvedValue('no-permission')
    const back = vi.fn()
    render(<FirstSuccessStep name="" onBackToReminders={back} onOpenToday={() => undefined} />)
    await tick(0)
    fireEvent.click(screen.getByRole('button', { name: 'Send a test reminder' }))
    await tick(0)
    fireEvent.click(screen.getByRole('button', { name: 'Turn on reminders first' }))
    expect(back).toHaveBeenCalledTimes(1)
    expect(h.track).not.toHaveBeenCalled()
  })

  it('reminders already off when the screen opens: no test button, never a false "It works"', async () => {
    h.display = false
    render(<FirstSuccessStep name="Mama" onBackToReminders={() => undefined} onOpenToday={() => undefined} />)
    await tick(0)
    expect(screen.getByRole('button', { name: 'Turn on reminders first' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Send a test reminder' })).toBeNull()
    expect(h.alarm).not.toHaveBeenCalled()
  })

  it('a failed schedule shows a plain line, keeps the test button and still lets the person leave', async () => {
    h.alarm.mockResolvedValue('failed')
    const open = vi.fn()
    render(<FirstSuccessStep name="Mama" onBackToReminders={() => undefined} onOpenToday={open} />)
    await tick(0)
    fireEvent.click(screen.getByRole('button', { name: 'Send a test reminder' }))
    await tick(0)
    expect(screen.getByRole('alert').textContent).toContain('could not be set')
    expect(screen.getByRole('button', { name: 'Send a test reminder' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Open Today' }))
    expect(open).toHaveBeenCalledTimes(1)
  })
})
