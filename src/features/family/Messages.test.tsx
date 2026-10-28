import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({
  listMessages: vi.fn(), listQueued: vi.fn(), sendText: vi.fn(), sendAttachment: vi.fn(), removeMessage: vi.fn()
}))
vi.mock('./messagesApi', () => api)

import Messages from './Messages'

const ben = { id: 'p2', name: 'Kuya Ben', photoPath: null, thumb: null, phone: '+63 917 123 4567', birthdate: null, isMe: false }
const msgs = [
  { id: 'm1', mine: false, senderPersonId: 'p2', kind: 'text', body: 'Kumain ka na?', name: null, durationS: null, createdAt: new Date().toISOString(), url: null },
  { id: 'm2', mine: true, senderPersonId: 'p1', kind: 'voice', body: null, name: null, durationS: 12, createdAt: new Date().toISOString(), url: 'blob:x' }
]
const show = () => render(<Messages who={ben} people={[ben]} nudge={null} onClose={() => undefined} onOpenPage={() => undefined} />)

beforeEach(() => {
  api.listMessages.mockResolvedValue({ ok: true, data: msgs })
  api.listQueued.mockResolvedValue([])
  api.sendText.mockResolvedValue({ ok: true, data: null })
  api.sendAttachment.mockResolvedValue({ ok: true, data: null })
  api.removeMessage.mockResolvedValue({ ok: true, data: null })
})
afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('Messages', () => {
  it('shows the thread with who sent what, a voice player and Call', async () => {
    show()
    const list = await screen.findByTestId('msg-list')
    expect(within(list).getByText('Kumain ka na?')).toBeTruthy()
    expect(within(list).getByText('Kuya')).toBeTruthy()
    expect(within(list).getByLabelText(/Voice note from You, 0:12/)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Call Kuya' }).getAttribute('href')).toBe('tel:+639171234567')
  })
  it('quick replies send the exact words through sendText, inline or in a sheet', async () => {
    const me = { ...ben, isMe: true }
    render(<Messages inline who={me} people={[me]} nudge={null} onClose={() => undefined} onOpenPage={() => undefined} />)
    await screen.findByTestId('msg-list')
    const qr = screen.getByRole('group', { name: 'Quick replies' })
    expect(within(qr).getAllByRole('button').map((b) => b.textContent)).toEqual(['All good', 'On my way'])
    fireEvent.click(within(qr).getByRole('button', { name: 'On my way' }))
    await waitFor(() => expect(api.sendText).toHaveBeenCalledWith('On my way'))
    expect(screen.queryByRole('dialog')).toBeNull() // inline: no sheet
  })
  it('the sheet (opened from a member bubble) shows the quick replies and sends the exact words', async () => {
    show()
    const dlg = await screen.findByRole('dialog', { name: 'Message Kuya' })
    const qr = within(dlg).getByRole('group', { name: 'Quick replies' })
    expect(within(qr).getAllByRole('button').map((b) => b.textContent)).toEqual(['All good', 'On my way'])
    fireEvent.click(within(qr).getByRole('button', { name: 'All good' }))
    await waitFor(() => expect(api.sendText).toHaveBeenCalledWith('All good'))
  })
  it('the inline header names the family and counts people', async () => {
    const me = { ...ben, isMe: true }
    render(<Messages inline who={me} people={[me, ben, { ...ben, id: 'p3' }]} nudge={null} onClose={() => undefined} onOpenPage={() => undefined} />)
    await screen.findByTestId('msg-list')
    expect(screen.getByRole('heading', { name: 'Family messages' })).toBeTruthy()
    expect(screen.getByText('3 people, one shared chat')).toBeTruthy()
    expect(screen.getByRole('list', { name: 'Messages' })).toBeTruthy() // the list is not named like the h2 or the region
  })
  it('the inline header shows no count before the roster has people', async () => {
    const me = { ...ben, isMe: true }
    render(<Messages inline who={me} people={[]} nudge={null} onClose={() => undefined} onOpenPage={() => undefined} />)
    await screen.findByTestId('msg-list')
    expect(screen.queryByText(/people|person/)).toBeNull()
  })
  it('sends a text and clears the box; empty text cannot be sent', async () => {
    show()
    await screen.findByTestId('msg-list')
    const send = screen.getByRole('button', { name: 'Send' }) as HTMLButtonElement
    expect(send.disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Opo, kumain na' } })
    fireEvent.click(send)
    await waitFor(() => expect(api.sendText).toHaveBeenCalledWith('Opo, kumain na'))
    await waitFor(() => expect((screen.getByLabelText('Message') as HTMLTextAreaElement).value).toBe(''))
  })
  it('a text waiting in the outbox shows with a Queued tag and no delete, even when the thread cannot load (offline)', async () => {
    api.listMessages.mockResolvedValue({ ok: false, error: 'offline' })
    api.listQueued.mockResolvedValue([{ id: 'c1', clientId: 'c1', queued: true, mine: true, senderPersonId: null, kind: 'text', body: 'Wait lang', name: null, durationS: null, createdAt: new Date().toISOString(), url: null }])
    show()
    const list = await screen.findByTestId('msg-list')
    expect(within(list).getByText('Wait lang')).toBeTruthy()
    expect(within(list).getByTestId('msg-queued').textContent).toMatch(/Queued/)
    expect(within(list).queryByRole('button', { name: 'Delete this message' })).toBeNull()
    expect(screen.getByTestId('msg-state').textContent).toBe('Messages show when you are online')
  })
  it('refuses a file over 10 MB or of a strange type without uploading', async () => {
    show()
    await screen.findByTestId('msg-list')
    const input = screen.getByTestId('msg-file')
    fireEvent.change(input, { target: { files: [new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'big.pdf', { type: 'application/pdf' })] } })
    expect((await screen.findByRole('alert')).textContent).toMatch(/over 10 MB/)
    fireEvent.change(input, { target: { files: [new File(['x'], 'a.exe', { type: 'application/x-msdownload' })] } })
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/pictures, PDF/))
    expect(api.sendAttachment).not.toHaveBeenCalled()
  })
  it('a phone that cannot record says so in plain words', async () => {
    show()
    await screen.findByTestId('msg-list')
    fireEvent.click(screen.getByRole('button', { name: 'Record a voice note' }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/Voice notes do not work on this phone/)
  })
  it('only my own message can be deleted, after a confirm', async () => {
    show()
    await screen.findByTestId('msg-list')
    const dels = screen.getAllByRole('button', { name: 'Delete this message' })
    expect(dels).toHaveLength(1)
    fireEvent.click(dels[0]!)
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(api.removeMessage).toHaveBeenCalledWith('m2'))
  })
  it('says plainly when messages are not set up', async () => {
    api.listMessages.mockResolvedValue({ ok: false, error: 'not_set_up' })
    show()
    expect((await screen.findByTestId('msg-state')).textContent).toBe('Messages are not set up yet')
  })
})
