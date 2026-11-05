// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../shell/JackSheet', () => ({ JackSheet: ({ onClose, onSos }: { onClose: () => void; onSos: () => void }) => <div role="dialog" data-testid="jack-sheet"><button onClick={onClose}>x</button><button onClick={onSos}>sos</button></div> }))
vi.mock('../sos/SosScreen', () => ({ default: ({ onClose }: { onClose: () => void }) => <div data-testid="sos-screen"><button onClick={onClose}>cancel</button></div> }))
vi.mock('../auth/session', async (orig) => ({ ...(await orig<object>()), getMember: () => Promise.resolve(null) }))
afterEach(() => { cleanup(); location.hash = '' })

import CalmJack, { CALM_JACK_EVENT } from './CalmJack'

const open = () => act(() => { window.dispatchEvent(new Event(CALM_JACK_EVENT)) })

describe('CalmJack', () => {
  it('opens on the event and closing returns focus to Ask Jack', () => {
    render(<><button className="cm-ask">opener</button><CalmJack /></>)
    const opener = screen.getByRole('button', { name: 'opener' })
    opener.focus(); open()
    expect(screen.getByTestId('jack-sheet')).toBeTruthy()
    fireEvent.click(screen.getByText('x'))
    expect(screen.queryByTestId('jack-sheet')).toBeNull()
    expect(document.activeElement).toBe(opener)
  })
  it('the sheet SOS opens the full SOS screen', () => {
    render(<CalmJack />)
    open(); fireEvent.click(screen.getByText('sos'))
    expect(screen.queryByTestId('jack-sheet')).toBeNull()
    expect(screen.getByTestId('sos-full').querySelector('[data-testid="sos-screen"]')).not.toBeNull()
  })
  it('SOS stays on screen when the hash changes away from #calm', () => {
    location.hash = '#calm'
    render(<CalmJack />)
    open(); fireEvent.click(screen.getByText('sos'))
    act(() => { location.hash = '#today'; window.dispatchEvent(new HashChangeEvent('hashchange')) })
    expect(screen.getByTestId('sos-full')).toBeTruthy()
  })
  it('the sheet stays open at #calm/listen (the same page) and closes on leaving it', () => {
    location.hash = '#calm'
    render(<CalmJack />)
    open()
    act(() => { location.hash = '#calm/listen'; window.dispatchEvent(new HashChangeEvent('hashchange')) })
    expect(screen.getByTestId('jack-sheet')).toBeTruthy()
    act(() => { location.hash = '#today'; window.dispatchEvent(new HashChangeEvent('hashchange')) })
    expect(screen.queryByTestId('jack-sheet')).toBeNull()
  })
  it('the sheet closes when the user leaves #calm', () => {
    location.hash = '#calm'
    render(<CalmJack />)
    open()
    act(() => { location.hash = '#today'; window.dispatchEvent(new HashChangeEvent('hashchange')) })
    expect(screen.queryByTestId('jack-sheet')).toBeNull()
  })
})
