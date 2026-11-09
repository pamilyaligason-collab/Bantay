// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetRadioForTests } from '../discover/listen/radioPlayer'
import { STATIONS } from '../discover/listen/stations'
import { startSos } from '../sos/active'
import MediaLinks from './MediaLinks'

let play: ReturnType<typeof vi.fn>
let pause: ReturnType<typeof vi.fn>
beforeEach(() => {
  resetRadioForTests()
  play = vi.fn(() => Promise.resolve())
  pause = vi.fn()
  HTMLMediaElement.prototype.play = play as never
  HTMLMediaElement.prototype.pause = pause as never
  HTMLMediaElement.prototype.load = vi.fn()
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

const card = (id: string) => screen.getByTestId(`radio-${id}`)
const tap = async (name: string) => { await act(async () => { fireEvent.click(screen.getByRole('button', { name })) }) }
const frames = () => screen.getByTestId('calm-media').querySelectorAll('iframe')

describe('Calm > Listen and watch radio (the Discover player)', () => {
  it('shows the three sections in order, requests nothing before a tap, and the old stations are gone', () => {
    render(<MediaLinks />)
    const secs = Array.from(screen.getByTestId('calm-media').querySelectorAll('section.rd-sec h3')).map((h) => h.textContent)
    expect(secs).toEqual(['Music & Light Rock', 'Pop & Mass', 'News & Talk'])
    expect(play).not.toHaveBeenCalled()
    expect(screen.getByTestId('calm-media').textContent).not.toMatch(/Radio Paradise|Swiss|SomaFM|Tara Brach/)
  })
  it('each card links its own official site', () => {
    render(<MediaLinks />)
    for (const s of STATIONS) expect(within(card(s.id)).getByRole('link', { name: /Official site/ }).getAttribute('href')).toBe(s.site)
  })
  it('playing a video stops the radio', async () => {
    render(<MediaLinks />)
    await tap('Play Love Radio')
    expect(card('love').dataset.state).toBe('connecting')
    act(() => { fireEvent.click(screen.getByRole('button', { name: /Play Heavy Rain/ })) })
    expect(card('love').dataset.state).toBe('idle')
    expect(frames()).toHaveLength(1)
  })
  it('starting the radio stops a playing video (the poster comes back)', async () => {
    render(<MediaLinks />)
    fireEvent.click(screen.getByRole('button', { name: /Play Heavy Rain/ }))
    expect(frames()).toHaveLength(1)
    await tap('Play DZRH')
    expect(frames()).toHaveLength(0)
    expect(card('dzrh').dataset.state).toBe('connecting') // the starter ignores its own event
  })
  it('an SOS stops the radio', async () => {
    render(<MediaLinks />)
    await tap('Play Easy Rock')
    act(() => { startSos() })
    expect(card('easyrock').dataset.state).toBe('idle')
  })
  it('leaving the section stops the audio', async () => {
    const { unmount } = render(<MediaLinks />)
    await tap('Play Love Radio')
    pause.mockClear()
    unmount()
    expect(pause).toHaveBeenCalled()
  })
})
