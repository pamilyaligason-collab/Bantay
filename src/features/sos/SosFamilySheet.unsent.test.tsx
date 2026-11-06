import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ send: vi.fn() }))
vi.mock('../family/roster', async (orig) => ({ ...(await orig<typeof import('../family/roster')>()), useFamilyPeople: () => ({ people: [{ id: 'me', name: 'Rey Tester', photoPath: null, thumb: null, phone: null, birthdate: null, isMe: true }, { id: 'p1', name: 'Ma Tester', photoPath: null, thumb: null, phone: '+63 917 000 0000', birthdate: null, isMe: false }], selfId: 'me' }) }))
vi.mock('../shell/useKv', () => ({ useKv: () => [[], vi.fn(), true] }))
vi.mock('../auth/family', () => ({ loadFamily: () => [] }))
vi.mock('../family/FmAvatar', () => ({ default: () => <span /> }))
vi.mock('../family/messagesApi', () => ({ sendAttachment: h.send }))
// Voice starts a finished recording at once: the recorder itself is covered by Messages
vi.mock('../family/useVoiceNote', () => ({
  useVoiceNote: () => {
    const [voice, setVoice] = useState<unknown>(null)
    return { rec: null, voice, setVoice, canRecord: true, startRec: async () => setVoice({ blob: new Blob(['x']), secs: 5, ext: 'webm', mime: 'audio/webm', url: 'blob:note' }), stop: vi.fn(), cancel: vi.fn() }
  }
}))
import SosFamilySheet from './SosFamilySheet'

const online = (v: boolean) => Object.defineProperty(navigator, 'onLine', { value: v, configurable: true })
const onClose = vi.fn()
const open = async () => { render(<SosFamilySheet onClose={onClose} />); fireEvent.click(screen.getByText('Ma Tester').closest('button')!); fireEvent.click(screen.getByRole('button', { name: 'Voice note for Ma' })); await screen.findByLabelText('Your voice note') }
beforeEach(() => { document.body.innerHTML = '<div class="bt"></div>'; h.send.mockReset(); onClose.mockReset() })
afterEach(() => { cleanup(); online(true) })

describe('SOS family sheet: an unsent voice note', () => {
  it('offline keeps the note, says Not sent yet, and Send again retries once back online', async () => {
    online(false)
    await open()
    fireEvent.click(screen.getByRole('button', { name: 'Send to Ma' }))
    expect(screen.getByText('Not sent yet: no signal')).toBeTruthy()
    expect(h.send).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Your voice note')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Discard' })).toBeTruthy()
    online(true)
    h.send.mockResolvedValue({ ok: true, data: null })
    fireEvent.click(screen.getByRole('button', { name: 'Send again' }))
    await waitFor(() => expect(h.send).toHaveBeenCalledTimes(1))
    expect(h.send.mock.calls[0]![1]).toMatchObject({ kind: 'voice', body: 'For Ma' })
    await waitFor(() => expect(screen.queryByLabelText('Your voice note')).toBeNull())
  })
  it('a failed send keeps the note too', async () => {
    h.send.mockResolvedValue({ ok: false, error: 'failed' })
    await open()
    fireEvent.click(screen.getByRole('button', { name: 'Send to Ma' }))
    await screen.findByText(/Not sent yet/)
    expect(screen.getByRole('button', { name: 'Send again' })).toBeTruthy()
  })
  it('closing with an unsent note asks first; Keep it stays, Close anyway closes', async () => {
    await open()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.getByRole('alertdialog', { name: /lose the voice note/ })).toBeTruthy()
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Keep it' }))
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(screen.getByLabelText('Your voice note')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    fireEvent.click(screen.getByRole('button', { name: 'Close anyway' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })
  it('Discard after the close confirm leaves no stale confirm; Close then closes at once', async () => {
    await open()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.getByRole('alertdialog')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }))
    expect(screen.queryByRole('alertdialog')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Voice note for Ma' }))
    await screen.findByLabelText('Your voice note')
    expect(screen.queryByRole('alertdialog')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }))
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })
  it('a successful send clears the confirm; Close then closes at once', async () => {
    h.send.mockResolvedValue({ ok: true, data: null })
    await open()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    fireEvent.click(screen.getByRole('button', { name: 'Keep it' }))
    fireEvent.click(screen.getByRole('button', { name: 'Send to Ma' }))
    await waitFor(() => expect(screen.queryByLabelText('Your voice note')).toBeNull())
    expect(screen.queryByRole('alertdialog')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })
})
