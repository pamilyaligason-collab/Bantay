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
  it('opens a modal with three rows; Escape closes it', async () => {
    render(<TabBar active="today" />)
    ask()
    const dlg = await screen.findByRole('dialog', { name: 'What would you like to do?' })
    expect(dlg.getAttribute('aria-modal')).toBe('true')
    for (const n of [/Talk to Jack Jack/, /Scan a paper/, /Upload a file/]) expect(screen.getByRole('button', { name: n })).toBeTruthy()
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
    expect(n).toBe(1)
    expect(screen.queryByRole('dialog')).toBeNull()
    window.removeEventListener(ASK_EVENT, on)
  })

  it('Scan opens the scan route and closes the sheet', async () => {
    render(<TabBar active="today" />)
    ask()
    fireEvent.click(await screen.findByRole('button', { name: /Scan a paper/ }))
    expect(location.hash).toBe('#scan')
    expect(history.state?.bantayScan).toBe(1)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('Upload hands the chosen file to the scan flow', async () => {
    render(<TabBar active="today" />)
    ask()
    await screen.findByRole('dialog')
    const f = new File(['x'], 'p.png', { type: 'image/png' })
    fireEvent.change(screen.getByTestId('ask-file'), { target: { files: [f] } })
    expect(location.hash).toBe('#scan')
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
