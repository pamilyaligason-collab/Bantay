// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { startSos } from '../sos/active'
import SosButton from '../sos/SosButton'
import SosHold from '../sos/SosHold'
import NofabSos from '../today/NofabSos'
import MediaLinks from './MediaLinks'
import { RADIO } from './media'
import { RADIO_STALL_MS } from './useRadio'

const G1 = 'https://stream.radioparadise.com/mellow-128'
const G2 = 'https://stream-uk1.radioparadise.com/mellow-128'
const D1 = 'https://stream.srg-ssr.ch/srgssr/rsc_de/mp3/128'

let play: ReturnType<typeof vi.fn>
let pause: ReturnType<typeof vi.fn>
beforeEach(() => {
  play = vi.fn(() => Promise.resolve())
  pause = vi.fn()
  HTMLMediaElement.prototype.play = play as never
  HTMLMediaElement.prototype.pause = pause as never
  HTMLMediaElement.prototype.load = vi.fn()
})
afterEach(() => { cleanup(); vi.useRealTimers() })

const audio = () => screen.getByTestId('calm-audio') as HTMLAudioElement
const card = (id: string) => screen.getByTestId(`calm-radio-${id}`)
const tap = (id: string) => fireEvent.click(within(card(id)).getByRole('button', { name: /^(Play|Stop) Radio/ }))

describe('radio', () => {
  it('requests nothing before a tap', () => {
    render(<MediaLinks />)
    expect(play).not.toHaveBeenCalled()
    expect(audio().hasAttribute('src')).toBe(false)
    expect(audio().getAttribute('preload')).toBe('none')
    expect(card('rpmellow').dataset.state).toBe('idle')
  })
  it('every stream address is https (the APK refuses plain http), and one line says the radio stops when you leave', () => {
    expect(RADIO.length).toBeGreaterThan(0)
    for (const s of RADIO) { expect(s.streams.length).toBeGreaterThan(0); for (const u of s.streams) expect(u, `${s.id}: ${u}`).toMatch(/^https:\/\//) }
    render(<MediaLinks />)
    expect(screen.getByTestId('calm-media').textContent).toContain('Radio stops when you leave Calm.')
  })
  it('each card names its source and links its own site, in every state', () => {
    render(<MediaLinks />)
    const site = (id: string) => within(card(id)).getByRole('link', { name: /Station site/ }).getAttribute('href')
    expect(card('rpmellow').textContent).toContain('Radio Paradise Mellow')
    expect(site('rpmellow')).toBe('https://radioparadise.com/')
    expect(card('rsclassic').textContent).toContain('Radio Swiss Classic')
    expect(site('rsclassic')).toBe('https://www.radioswissclassic.ch/')
    tap('rpmellow')
    expect(site('rpmellow')).toBe('https://radioparadise.com/')
    fireEvent.error(audio()); fireEvent.error(audio())
    expect(card('rpmellow').dataset.state).toBe('error')
    expect(site('rpmellow')).toBe('https://radioparadise.com/')
  })
  it('loading, then playing with bars, then stop clears the address', () => {
    render(<MediaLinks />)
    tap('rpmellow')
    expect(audio().getAttribute('src')).toBe(G1)
    expect(card('rpmellow').dataset.state).toBe('loading')
    expect(card('rpmellow').textContent).toMatch(/Loading/)
    expect(card('rpmellow').querySelector('.cm-eq')).toBeNull()
    fireEvent.playing(audio())
    expect(card('rpmellow').dataset.state).toBe('playing')
    expect(card('rpmellow').querySelectorAll('.cm-eq i')).toHaveLength(4)
    tap('rpmellow')
    expect(card('rpmellow').dataset.state).toBe('idle')
    expect(pause).toHaveBeenCalled()
    expect(audio().hasAttribute('src')).toBe(false)
  })
  it('starting one stops the other, on the same element', () => {
    render(<MediaLinks />)
    tap('rpmellow'); fireEvent.playing(audio())
    tap('rsclassic')
    expect(card('rpmellow').dataset.state).toBe('idle')
    expect(card('rsclassic').dataset.state).toBe('loading')
    expect(audio().getAttribute('src')).toBe(D1)
    expect(document.querySelectorAll('audio')).toHaveLength(1)
  })
  it('an error tries the second address, a second error shows the plain line; Play tries again from the first', () => {
    render(<MediaLinks />)
    tap('rpmellow')
    fireEvent.error(audio())
    expect(audio().getAttribute('src')).toBe(G2)
    expect(card('rpmellow').dataset.state).toBe('loading')
    fireEvent.error(audio())
    expect(card('rpmellow').dataset.state).toBe('error')
    expect(card('rpmellow').textContent).toMatch(/The radio did not start\./)
    expect(audio().hasAttribute('src')).toBe(false)
    tap('rpmellow')
    expect(audio().getAttribute('src')).toBe(G1)
    expect(card('rpmellow').textContent).not.toMatch(/did not start/)
  })
  it('a refused start goes to the error state without trying the next address', async () => {
    play.mockImplementation(() => Promise.reject(Object.assign(new Error('x'), { name: 'NotAllowedError' })))
    render(<MediaLinks />)
    await act(async () => { tap('rpmellow') })
    expect(card('rpmellow').dataset.state).toBe('error')
    expect(play).toHaveBeenCalledTimes(1)
  })
  it('a rejected play from a load failure or a stop changes nothing: the error event decides', async () => {
    play.mockImplementation(() => Promise.reject(Object.assign(new Error('x'), { name: 'NotSupportedError' })))
    render(<MediaLinks />)
    await act(async () => { tap('rpmellow') })
    expect(card('rpmellow').dataset.state).toBe('loading')
    expect(audio().getAttribute('src')).toBe(G1)
  })
  it('a stream that stays silent moves on after the stall time, and playing cancels that', () => {
    vi.useFakeTimers()
    render(<MediaLinks />)
    tap('rpmellow')
    act(() => { vi.advanceTimersByTime(RADIO_STALL_MS - 1) })
    expect(audio().getAttribute('src')).toBe(G1)
    act(() => { vi.advanceTimersByTime(1) })
    expect(audio().getAttribute('src')).toBe(G2)
    fireEvent.playing(audio())
    act(() => { vi.advanceTimersByTime(RADIO_STALL_MS * 2) })
    expect(card('rpmellow').dataset.state).toBe('playing')
  })
  it('leaving the section stops the audio', () => {
    const { unmount } = render(<MediaLinks />)
    tap('rpmellow'); fireEvent.playing(audio())
    const el = audio()
    pause.mockClear()
    unmount()
    expect(pause).toHaveBeenCalled()
    expect(el.hasAttribute('src')).toBe(false)
  })
  // Every way an SOS starts: each goes through startSos, and that alone must silence the radio.
  const stopped = () => {
    expect(card('rpmellow').dataset.state).toBe('idle')
    expect(audio().hasAttribute('src')).toBe(false)
    expect(pause).toHaveBeenCalled()
  }
  it('startSos itself stops it', () => {
    render(<MediaLinks />)
    tap('rpmellow'); fireEvent.playing(audio())
    act(() => { startSos() })
    stopped()
  })
  it('startSos stops a station that is still loading, and no later event brings it back', () => {
    render(<MediaLinks />)
    tap('rpmellow')
    act(() => { startSos() })
    stopped()
    fireEvent.playing(audio())
    expect(card('rpmellow').dataset.state).toBe('idle')
  })
  const confirm = (name: RegExp) => {
    fireEvent.keyDown(screen.getByRole('button', { name }), { key: 'Enter' })
    fireEvent.click(screen.getByRole('button', { name: 'Yes, send SOS' }))
  }
  it('the Jack sheet and Simple hold (SosHold) stops it', () => {
    const send = vi.fn()
    render(<><MediaLinks /><SosHold onSend={send} /></>)
    tap('rpmellow'); fireEvent.playing(audio())
    confirm(/^Hold to call and text/)
    stopped()
    expect(send).toHaveBeenCalledTimes(1)
  })
  it('the warning card hold (NofabSos) stops it', () => {
    render(<><MediaLinks /><NofabSos /></>)
    tap('rpmellow'); fireEvent.playing(audio())
    confirm(/^Hold to call and text/)
    stopped()
  })
  it('the Safety SOS button stops it', () => {
    const send = vi.fn()
    render(<><MediaLinks /><SosButton onSend={send} /></>)
    tap('rpmellow'); fireEvent.playing(audio())
    confirm(/^SOS\./)
    stopped()
    expect(send).toHaveBeenCalledTimes(1)
  })
  it('playing a video stops the radio', () => {
    render(<MediaLinks />)
    fireEvent.click(screen.getByRole('button', { name: 'Show 4 more' })) // S25: videos sit behind Show more
    tap('rpmellow'); fireEvent.playing(audio())
    fireEvent.click(screen.getByRole('button', { name: /Play Heavy Rain/ }))
    expect(card('rpmellow').dataset.state).toBe('idle')
    expect(screen.getByTestId('calm-media').querySelectorAll('iframe')).toHaveLength(1)
  })
  it('starting the radio stops a playing video (the poster comes back, no frame)', () => {
    render(<MediaLinks />)
    fireEvent.click(screen.getByRole('button', { name: 'Show 4 more' }))
    const frames = () => screen.getByTestId('calm-media').querySelectorAll('iframe')
    fireEvent.click(screen.getByRole('button', { name: /Play Heavy Rain/ }))
    expect(frames()).toHaveLength(1)
    tap('rpmellow')
    expect(frames()).toHaveLength(0)
    expect(screen.getByRole('button', { name: /Play Heavy Rain/ })).toBeTruthy()
    expect(card('rpmellow').dataset.state).toBe('loading') // the starter ignores its own event
  })
  it('starting a second video stops the first; the starter keeps playing', () => {
    render(<MediaLinks />)
    fireEvent.click(screen.getByRole('button', { name: 'Show 4 more' }))
    const frames = () => Array.from(screen.getByTestId('calm-media').querySelectorAll('iframe'))
    const play2 = screen.getAllByRole('button', { name: /^Play / }).filter((b) => b.classList.contains('lv-play'))
    expect(play2.length).toBeGreaterThan(1)
    fireEvent.click(play2[0]!)
    const first = frames()[0]!.getAttribute('title')
    fireEvent.click(screen.getAllByRole('button').filter((b) => b.classList.contains('lv-play'))[0]!)
    expect(frames()).toHaveLength(1)
    expect(frames()[0]!.getAttribute('title')).not.toBe(first)
  })
})
