import 'fake-indexeddb/auto'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db } from '../../db'
import { ASK_EVENT } from '../assistant/Assistant'
import { takePendingFile } from '../scan/open'
import { TabBar } from './TabBar'

beforeEach(async () => {
  history.replaceState(null, '', '/')
  await db.kv.clear()
})
afterEach(cleanup)

const ask = () => fireEvent.click(screen.getByRole('button', { name: 'Ask Bantay' }))

describe('Ask choice sheet', () => {
  it('renders into the page body, outside the glass tab bar', async () => {
    render(<TabBar active="today" />)
    ask()
    const dlg = await screen.findByRole('dialog')
    expect(dlg.closest('nav')).toBeNull()
  })

  it.each(['back', 'cancel', 'outside'])('closes via %s and leaves no extra history entry', async (how) => {
    render(<TabBar active="today" />)
    const before = history.length
    ask()
    const dlg = await screen.findByRole('dialog')
    if (how === 'back') history.back()
    else if (how === 'cancel') fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    else fireEvent.click(dlg.parentElement!)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await waitFor(() => expect(history.state?.bantayAsk).toBeUndefined())
    expect(history.length).toBeLessThanOrEqual(before + 1) // jsdom keeps forward entries; the point is state is ours no more
  })

  it('PDF line points to Health > Papers', async () => {
    render(<TabBar active="today" />)
    ask()
    fireEvent.click(await screen.findByRole('link', { name: /PDF files use Health > Papers/ }))
    await waitFor(() => expect(location.hash).toBe('#health/papers'))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('opens a modal with three rows; Escape closes it', async () => {
    render(<TabBar active="today" />)
    ask()
    const dlg = await screen.findByRole('dialog', { name: 'What would you like to do?' })
    expect(dlg.getAttribute('aria-modal')).toBe('true')
    for (const n of [/Talk to Jack Jack/, /Scan a paper/, /Upload a photo/]) expect(screen.getByRole('button', { name: n })).toBeTruthy()
    fireEvent.keyDown(dlg, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('Talk fires the assistant event', async () => {
    let n = 0
    const on = () => n++
    window.addEventListener(ASK_EVENT, on)
    render(<TabBar active="today" />)
    ask()
    fireEvent.click(await screen.findByRole('button', { name: /Talk to Jack Jack/ }))
    await waitFor(() => expect(n).toBe(1))
    expect(screen.queryByRole('dialog')).toBeNull()
    window.removeEventListener(ASK_EVENT, on)
  })

  it('Scan opens the scan route and closes the sheet', async () => {
    render(<TabBar active="today" />)
    ask()
    const before = history.length
    fireEvent.click(await screen.findByRole('button', { name: /Scan a paper/ }))
    await waitFor(() => expect(location.hash).toBe('#scan'))
    expect(history.state?.bantayScan).toBe(1)
    expect(history.length).toBe(before) // our pushed entry was popped, scan took its place: no dead entry
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('Upload hands the chosen file to the scan flow', async () => {
    render(<TabBar active="today" />)
    ask()
    await screen.findByRole('dialog')
    const f = new File(['x'], 'p.png', { type: 'image/png' })
    fireEvent.change(screen.getByTestId('ask-file'), { target: { files: [f] } })
    await waitFor(() => expect(location.hash).toBe('#scan'))
    expect(takePendingFile()).toBe(f)
    expect(takePendingFile()).toBeNull()
  })

  it('shows the hint once: gone after the first open, flag saved', async () => {
    render(<TabBar active="today" />)
    expect(await screen.findByText('Scan papers here too')).toBeTruthy()
    ask()
    await waitFor(() => expect(screen.queryByText('Scan papers here too')).toBeNull())
    await waitFor(async () => expect((await db.kv.get('askHintSeen'))?.value).toBe(true))
    cleanup()
    render(<TabBar active="today" />)
    await act(async () => { await new Promise((r) => setTimeout(r, 50)) })
    expect(screen.queryByText('Scan papers here too')).toBeNull()
  })
})
