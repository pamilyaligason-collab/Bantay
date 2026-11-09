import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({ listMessages: vi.fn() }))
vi.mock('./messagesApi', () => api)

import Messages from './Messages'

const ben = { id: 'p2', name: 'Kuya Ben', photoPath: null, thumb: null, phone: '+63 917 123 4567', birthdate: null, isMe: false }
const msgs = [
  { id: 'm1', mine: false, senderPersonId: 'p2', kind: 'text', body: 'Kumain ka na?', name: null, durationS: null, createdAt: new Date().toISOString(), url: null },
  { id: 'm2', mine: true, senderPersonId: 'p1', kind: 'voice', body: null, name: null, durationS: 12, createdAt: new Date().toISOString(), url: 'blob:x' },
  { id: 'm3', mine: false, senderPersonId: null, kind: 'recap', body: 'This week: 5 check-ins', name: null, durationS: null, createdAt: new Date().toISOString(), url: null }
]

beforeEach(() => { api.listMessages.mockResolvedValue({ ok: true, data: msgs }) })
afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('Messages (the read-only family feed, D-168)', () => {
  it('shows who sent what, a voice player and a recap line', async () => {
    render(<Messages people={[ben]} />)
    const list = await screen.findByTestId('msg-list')
    expect(within(list).getByText('Kumain ka na?')).toBeTruthy()
    expect(within(list).getByText('Kuya')).toBeTruthy()
    expect(within(list).getByLabelText(/Voice note from You, 0:12/)).toBeTruthy()
    expect(within(list).getByText('This week: 5 check-ins')).toBeTruthy()
    expect(screen.getByRole('list', { name: 'Alerts and check-ins' })).toBeTruthy()
  })
  it('has no composer: no text box, Send, quick replies, voice, attach or delete, and no dialog', async () => {
    render(<Messages people={[ben]} />)
    await screen.findByTestId('msg-list')
    expect(screen.queryByRole('textbox')).toBeNull()
    for (const n of [/^Send/, /Record a voice note/, /Attach/, /Delete this message/, /^All good$/, /^On my way$/]) expect(screen.queryByRole('button', { name: n })).toBeNull()
    expect(screen.queryByRole('group', { name: 'Quick replies' })).toBeNull()
    expect(screen.queryByRole('dialog')).toBeNull()
  })
  it('a voice row with a body shows the For tag above the player; text rows have none', async () => {
    api.listMessages.mockResolvedValue({ ok: true, data: [{ ...msgs[1]!, body: 'For Ma' }, { ...msgs[0]! }] })
    render(<Messages people={[ben]} />)
    const list = await screen.findByTestId('msg-list')
    expect(within(list).getAllByTestId('msg-for')).toHaveLength(1)
    expect(within(list).getByTestId('msg-for').textContent).toBe('For Ma')
  })
  it('says plainly when messages are not set up or offline, and shows no list', async () => {
    api.listMessages.mockResolvedValue({ ok: false, error: 'not_set_up' })
    const first = render(<Messages people={[ben]} />)
    expect((await screen.findByTestId('msg-state')).textContent).toBe('Messages are not set up yet')
    expect(screen.queryByTestId('msg-list')).toBeNull()
    first.unmount()
    api.listMessages.mockResolvedValue({ ok: false, error: 'offline' })
    render(<Messages people={[ben]} />)
    expect((await screen.findByTestId('msg-state')).textContent).toBe('Messages show when you are online')
  })
  it('an empty feed says what will show here', async () => {
    api.listMessages.mockResolvedValue({ ok: true, data: [] })
    render(<Messages people={[ben]} />)
    expect(await screen.findByText('Alerts and check-ins from your family show here.')).toBeTruthy()
  })
})
