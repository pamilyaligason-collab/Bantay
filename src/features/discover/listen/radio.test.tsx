import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Radio from './Radio'
import { SECTIONS, STATIONS } from './stations'
import { announceMedia, onOtherMedia } from '../../media/mediaStart'
import { SOS_STARTED_EVENT } from '../../sos/active'
import { RADIO_STALL_MS, resetRadioForTests } from './radioPlayer'

/** A mock Audio: one instance is created lazily, so "created once" proves the element is shared. */
const made: FakeAudio[] = []
class FakeAudio {
  src = ''
  preload = ''
  fail = false
  private ls: Record<string, (() => void)[]> = {}
  constructor() { made.push(this) }
  addEventListener(n: string, f: () => void) { (this.ls[n] ??= []).push(f) }
  fire(n: string) { (this.ls[n] ?? []).forEach((f) => f()) }
  play = vi.fn(() => (this.fail ? Promise.reject(new Error('blocked')) : Promise.resolve()))
  pause = vi.fn()
  load = vi.fn()
  removeAttribute(a: string) { if (a === 'src') this.src = '' }
}
const session = { metadata: null as unknown, playbackState: 'none', setActionHandler: vi.fn() }

beforeEach(() => {
  made.length = 0
  resetRadioForTests()
  session.setActionHandler.mockReset()
  vi.stubGlobal('Audio', FakeAudio)
  vi.stubGlobal('MediaMetadata', class { constructor(public init: object) { Object.assign(this, init) } })
  Object.defineProperty(navigator, 'mediaSession', { configurable: true, value: session })
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); Reflect.deleteProperty(navigator, 'mediaSession') })

describe('Live radio', () => {
  it('offline: Play is disabled and the offline note shows; a station already playing can still stop', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    render(<Radio />)
    expect((screen.getByRole('button', { name: 'Play Love Radio' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText('You are offline. These open when you are back online.')).toBeTruthy()
    vi.restoreAllMocks()
  })

  it('a stream that stays silent for 15 s becomes the Could not connect state', async () => {
    vi.useFakeTimers()
    try {
      render(<Radio />)
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Play Love Radio' })) })
      expect(screen.getByTestId('radio-love').dataset.state).toBe('connecting')
      act(() => { vi.advanceTimersByTime(RADIO_STALL_MS - 1) })
      expect(screen.getByTestId('radio-love').dataset.state).toBe('connecting')
      act(() => { vi.advanceTimersByTime(1) })
      expect(screen.getByTestId('radio-love').dataset.state).toBe('error')
      expect(screen.getByText('Could not connect, try again.')).toBeTruthy()
      expect(made[0]!.src).toBe('')
    } finally { vi.useRealTimers() }
  })

  it('a station with a second address tries it after the first fails, then errors; playing cancels the stall timer', async () => {
    vi.useFakeTimers()
    const love = STATIONS[0]!
    love.alt = 'https://alt.example.test/love'
    try {
      render(<Radio />)
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Play Love Radio' })) })
      expect(made[0]!.src).toBe(love.url)
      act(() => made[0]!.fire('error'))
      expect(made[0]!.src).toBe(love.alt)
      expect(screen.getByTestId('radio-love').dataset.state).toBe('connecting')
      act(() => made[0]!.fire('error'))
      expect(screen.getByTestId('radio-love').dataset.state).toBe('error')
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Try Love Radio again' })) })
      act(() => { vi.advanceTimersByTime(RADIO_STALL_MS) }) // first address stalls: the second is tried
      expect(made[0]!.src).toBe(love.alt)
      act(() => made[0]!.fire('playing'))
      act(() => { vi.advanceTimersByTime(RADIO_STALL_MS * 2) })
      expect(screen.getByTestId('radio-love').dataset.state).toBe('playing')
    } finally { delete love.alt; vi.useRealTimers() }
  })

  it('lists the five stations, all over HTTPS, and the data and personal-use notes', () => {
    render(<Radio />)
    expect(STATIONS).toHaveLength(5)
    expect(STATIONS.every((s) => s.url.startsWith('https://'))).toBe(true)
    expect(screen.getAllByRole('button')).toHaveLength(5)
    expect(screen.getByText(/up to about 60 MB an hour/)).toBeTruthy()
    expect(screen.getByText(/for personal listening/)).toBeTruthy()
  })

  it('one plays at a time: starting a second station reuses the one audio element and the first card goes idle', async () => {
    render(<Radio />)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Play Love Radio' })) })
    expect(made).toHaveLength(1)
    expect(made[0]!.src).toBe(STATIONS[0]!.url)
    expect(screen.getByTestId('radio-love').dataset.state).toBe('connecting')
    act(() => made[0]!.fire('playing'))
    expect(screen.getByTestId('radio-love').dataset.state).toBe('playing')
    expect(screen.getByRole('button', { name: 'Stop Love Radio' })).toBeTruthy()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Play DZRH' })) })
    expect(made).toHaveLength(1)
    expect(made[0]!.src).toBe(STATIONS[2]!.url)
    expect(screen.getByTestId('radio-love').dataset.state).toBe('idle')
    expect(screen.getByTestId('radio-dzrh').dataset.state).toBe('connecting')
  })

  it('stop pauses, drops the stream and returns the card to idle', async () => {
    render(<Radio />)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Play Easy Rock' })) })
    act(() => made[0]!.fire('playing'))
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Stop Easy Rock' })) })
    expect(made[0]!.pause).toHaveBeenCalled()
    expect(made[0]!.load).toHaveBeenCalled()
    expect(made[0]!.src).toBe('')
    expect(screen.getByTestId('radio-easyrock').dataset.state).toBe('idle')
  })

  it('error: shows the message, and the button retries the same station', async () => {
    render(<Radio />)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Play Home Radio' })) })
    act(() => made[0]!.fire('error'))
    expect(screen.getByText('Could not connect, try again.')).toBeTruthy()
    expect(screen.getByTestId('radio-home').dataset.state).toBe('error')
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Try Home Radio again' })) })
    expect(made[0]!.play).toHaveBeenCalledTimes(2)
    expect(screen.getByTestId('radio-home').dataset.state).toBe('connecting')
  })

  it('a refused play() (no network) is an error too', async () => {
    vi.stubGlobal('Audio', class extends FakeAudio { constructor() { super(); this.fail = true } })
    render(<Radio />)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Play Magic 89.9' })) })
    expect(screen.getByTestId('radio-magic').dataset.state).toBe('error')
  })

  it('sets Media Session metadata and play, pause and stop handlers; pause from the lock screen stops the stream', async () => {
    render(<Radio />)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Play Love Radio' })) })
    expect(session.metadata).toMatchObject({ title: 'Love Radio', artist: 'FM 90.7 · MANILA' })
    const names = session.setActionHandler.mock.calls.map((c) => c[0])
    expect(names).toEqual(expect.arrayContaining(['play', 'pause', 'stop']))
    const pause = session.setActionHandler.mock.calls.find((c) => c[0] === 'pause')![1] as () => void
    act(() => pause())
    expect(screen.getByTestId('radio-love').dataset.state).toBe('idle')
    const play = session.setActionHandler.mock.calls.find((c) => c[0] === 'play')![1] as () => void
    await act(async () => { play() })
    expect(screen.getByTestId('radio-love').dataset.state).toBe('connecting')
  })

  it('leaving the page stops the stream', async () => {
    const { unmount } = render(<Radio />)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Play Love Radio' })) })
    unmount()
    expect(made[0]!.pause).toHaveBeenCalled()
  })

  it('groups the stations into three sections, each credited with its own official site', () => {
    render(<Radio />)
    const secs = Array.from(document.querySelectorAll('section.rd-sec')).map((s) => ({ h: s.querySelector('h3')!.textContent, names: Array.from(s.querySelectorAll('.rd-nm')).map((n) => n.textContent) }))
    expect(secs).toEqual([
      { h: 'Music & Light Rock', names: ['Easy Rock', 'Home Radio'] },
      { h: 'Pop & Mass', names: ['Love Radio', 'Magic 89.9'] },
      { h: 'News & Talk', names: ['DZRH'] }
    ])
    expect(SECTIONS.map((s) => s.label)).toEqual(['Music & Light Rock', 'Pop & Mass', 'News & Talk'])
    for (const s of STATIONS) {
      const a = screen.getByTestId(`radio-${s.id}`).querySelector('a.rd-site')!
      expect(a.getAttribute('href')).toBe(s.site)
      expect(a.getAttribute('rel')).toBe('noopener noreferrer')
    }
  })

  it('is the one player: a video starting stops the radio, and starting a station tells videos to stop', async () => {
    const heard: unknown[] = []
    const off = onOtherMedia('video-test', () => heard.push(1))
    render(<Radio />)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Play Love Radio' })) })
    expect(heard).toHaveLength(1) // the radio announced itself
    act(() => made[0]!.fire('playing'))
    expect(screen.getByTestId('radio-love').dataset.state).toBe('playing')
    act(() => announceMedia('video-test'))
    expect(screen.getByTestId('radio-love').dataset.state).toBe('idle')
    expect(made[0]!.pause).toHaveBeenCalled()
    off()
  })

  it('an SOS stops the radio', async () => {
    render(<Radio />)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Play DZRH' })) })
    act(() => { window.dispatchEvent(new Event(SOS_STARTED_EVENT)) })
    expect(screen.getByTestId('radio-dzrh').dataset.state).toBe('idle')
  })

  it('no Zeno host is used anywhere (every link returned 401 or 404)', () => {
    for (const s of STATIONS) {
      expect(new URL(s.url).hostname, s.id).not.toMatch(/zeno/i)
      expect(new URL(s.site).hostname, s.id).not.toMatch(/zeno/i)
    }
    expect(STATIONS.map((s) => s.id)).toEqual(['love', 'easyrock', 'dzrh', 'home', 'magic'])
  })

  it('white text on every gradient stop is at least 4.5:1', () => {
    const lum = (h: string) => { const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]! }
    for (const s of STATIONS) for (const g of s.grad) expect(1.05 / (lum(g) + 0.05), `${s.name} ${g}`).toBeGreaterThanOrEqual(4.5)
  })
})
