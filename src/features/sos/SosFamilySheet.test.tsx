import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  people: [] as { id: string; name: string; photoPath: null; thumb: null; phone: string | null; birthdate: null; isMe: boolean }[],
  saved: [] as unknown[], call: vi.fn(), send: vi.fn(async () => ({ ok: true as const, data: null }))
}))
vi.mock('../family/roster', async (orig) => ({ ...(await orig<typeof import('../family/roster')>()), useFamilyPeople: () => ({ people: h.people, selfId: 'me' }) }))
vi.mock('../shell/useKv', () => ({ useKv: () => [h.saved, vi.fn(), true] }))
vi.mock('../auth/family', () => ({ loadFamily: () => [] }))
vi.mock('../family/FmAvatar', () => ({ default: ({ name }: { name: string }) => <span>{name[0]}</span> }))
vi.mock('./call', () => ({ callFirstContact: (...a: unknown[]) => h.call(...a) }))
vi.mock('../family/messagesApi', () => ({ sendAttachment: h.send }))
import SosFamilySheet, { numberFor } from './SosFamilySheet'

const P = (id: string, name: string, phone: string | null, isMe = false) => ({ id, name, photoPath: null, thumb: null, phone, birthdate: null, isMe })
beforeEach(() => {
  document.body.innerHTML = '<div class="bt"></div>'
  h.people = [P('me', 'Rey Tester', '+63 917 000 0001', true), P('p1', 'Ma Tester', '+63 917 000 0000'), P('p2', 'Jo Tester', null), P('p3', 'Lita Tester', null)]
  h.saved = [{ name: 'Jo', phone: '0918 000 0000', personId: 'p2' }]
  h.call.mockClear(); h.send.mockClear()
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('SosFamilySheet (D-137)', () => {
  it('lists everyone except me, one row each', () => {
    render(<SosFamilySheet onClose={vi.fn()} />)
    const rows = screen.getAllByRole('button', { expanded: false })
    expect(rows).toHaveLength(3)
    expect(rows.some((b) => b.textContent?.includes('Ma Tester'))).toBe(true)
    expect(rows.some((b) => b.textContent?.includes('Rey Tester'))).toBe(false)
  })
  it('a person with a profile number: Call is tel: and Text is sms: with the digits and a short text', () => {
    render(<SosFamilySheet onClose={vi.fn()} />)
    fireEvent.click(screen.getByText('Ma Tester').closest('button')!)
    expect(screen.getByRole('link', { name: 'Call Ma' }).getAttribute('href')).toBe('tel:+639170000000')
    expect(screen.getByRole('link', { name: 'Text Ma' }).getAttribute('href')).toBe(`sms:+639170000000?body=${encodeURIComponent('Hi Ma, please call me. Sent from Bantay.')}`)
    fireEvent.click(screen.getByRole('link', { name: 'Call Ma' }))
    expect(h.call).toHaveBeenCalledWith([{ name: 'Ma Tester', phone: '+639170000000' }])
  })
  it('falls back to the number saved in the SOS contacts', () => {
    render(<SosFamilySheet onClose={vi.fn()} />)
    fireEvent.click(screen.getByText('Jo Tester').closest('button')!)
    expect(screen.getByRole('link', { name: 'Call Jo' }).getAttribute('href')).toBe('tel:09180000000')
  })
  it('no number anywhere: says so, offers no Call or Text', () => {
    render(<SosFamilySheet onClose={vi.fn()} />)
    fireEvent.click(screen.getByText('Lita Tester').closest('button')!)
    expect(screen.getAllByText('No number saved: add one in Me > Family').length).toBeGreaterThan(0)
    expect(screen.queryByRole('link', { name: /Call Lita|Text Lita/ })).toBeNull()
  })
  it('Voice is hidden when MediaRecorder is undefined', () => {
    render(<SosFamilySheet onClose={vi.fn()} />)
    fireEvent.click(screen.getByText('Ma Tester').closest('button')!)
    expect(screen.queryByRole('button', { name: /Voice note for/ })).toBeNull()
  })
  it('Voice shows when the phone can record', () => {
    vi.stubGlobal('MediaRecorder', class { static isTypeSupported = () => true })
    Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia: vi.fn() }, configurable: true })
    render(<SosFamilySheet onClose={vi.fn()} />)
    fireEvent.click(screen.getByText('Ma Tester').closest('button')!)
    expect(screen.getByRole('button', { name: 'Voice note for Ma' })).toBeTruthy()
    Object.defineProperty(navigator, 'mediaDevices', { value: undefined, configurable: true })
  })
  it('keeps the Call 911 dial button', () => {
    render(<SosFamilySheet onClose={vi.fn()} />)
    expect(screen.getByRole('button', { name: /Call 911/ })).toBeTruthy()
  })
  it('numberFor: profile phone first, then the saved contact, else null', () => {
    expect(numberFor({ id: 'a', phone: '+63 917 000 0000' }, [])).toBe('+639170000000')
    expect(numberFor({ id: 'a', phone: null }, [{ personId: 'a', phone: '0917 000 0000' }])).toBe('09170000000')
    expect(numberFor({ id: 'a', phone: '123' }, [{ personId: 'b', phone: '0917 000 0000' }])).toBeNull()
  })
})
