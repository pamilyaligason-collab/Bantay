import 'fake-indexeddb/auto'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../admin/events', () => ({ track: vi.fn(async () => true) }))
vi.mock('./client', () => ({ ask: vi.fn() }))
import Assistant, { ASK_EVENT } from './Assistant'

beforeEach(() => { history.replaceState(null, '', '/') })
afterEach(cleanup)

const openSheet = () => act(() => { window.dispatchEvent(new Event(ASK_EVENT)) })

describe('Assistant: scan a paper', () => {
  it('has a camera button left of the text field that opens the scan flow', async () => {
    const seen: string[] = []
    const on = () => seen.push(location.hash)
    window.addEventListener('hashchange', on)
    render(<Assistant />)
    openSheet()
    const field = await screen.findByLabelText('Your question')
    const cam = screen.getAllByRole('button', { name: 'Scan & Capture' }).find((b) => b.classList.contains('as-cam'))!
    expect(cam.compareDocumentPosition(field) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy() // the button comes before the field
    fireEvent.click(cam)
    expect(location.hash).toBe('#scan')
    expect(history.state?.bantayScan).toBe(1)
    expect(seen).toContain('#scan')
    expect(screen.queryByLabelText('Your question')).toBeNull() // the sheet closed
    window.removeEventListener('hashchange', on)
  })

  it('the "Scan & Capture" chip opens it too', async () => {
    render(<Assistant />)
    openSheet()
    await screen.findByLabelText('Your question')
    fireEvent.click(screen.getAllByRole('button', { name: 'Scan & Capture' }).find((b) => b.classList.contains('as-chip'))!)
    expect(location.hash).toBe('#scan')
  })
})
