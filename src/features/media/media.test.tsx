import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AnimatedDemo } from './AnimatedDemo'
import { LiteVideo } from './LiteVideo'
import VideoCard from '../today/VideoCard'

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks() })
const setOnline = (v: boolean) => vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(v)

describe('LiteVideo', () => {
  it('loads no iframe or image before the tap, and links to YouTube', () => {
    setOnline(true)
    const { container } = render(<LiteVideo id="M4ACYp75mjU" title="Hands-only CPR" />)
    expect(container.querySelector('iframe')).toBeNull()
    expect(container.querySelector('img')).toBeNull()
    expect(screen.getByRole('link', { name: /Open in YouTube/ }).getAttribute('href')).toBe('https://www.youtube.com/watch?v=M4ACYp75mjU')
  })
  it('a tap mounts the youtube-nocookie player for that id, with start and referrer policy', () => {
    setOnline(true)
    const { container } = render(<LiteVideo id="M4ACYp75mjU" title="Hands-only CPR" start={30} />)
    fireEvent.click(screen.getByRole('button', { name: 'Play Hands-only CPR' }))
    const f = container.querySelector('iframe')!
    expect(f.getAttribute('src')).toMatch(/^https:\/\/www\.youtube-nocookie\.com\/embed\/M4ACYp75mjU\?.*start=30/)
    expect(f.getAttribute('referrerpolicy')).toBe('strict-origin-when-cross-origin')
    expect(f.getAttribute('title')).toBe('Hands-only CPR')
  })
  it('offline shows the title and Open when online, never an iframe or play button, and keeps the link', () => {
    setOnline(false)
    const { container } = render(<LiteVideo id="M4ACYp75mjU" title="Hands-only CPR" />)
    expect(screen.getByText('Open when online')).toBeTruthy()
    expect(container.querySelector('iframe')).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.getByRole('link', { name: /Open in YouTube/ })).toBeTruthy()
  })
  it('a malformed id renders nothing', () => {
    setOnline(true)
    const { container } = render(<LiteVideo id="bad" title="x" />)
    expect(container.innerHTML).toBe('')
  })
})

describe('Today video card', () => {
  it('plays inline through LiteVideo: a poster button, no iframe until tapped', () => {
    setOnline(true)
    const { container } = render(<VideoCard />)
    expect(screen.getByRole('heading', { name: 'Video of the day' })).toBeTruthy()
    expect(container.querySelector('iframe')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /^Play / }))
    expect(container.querySelector('iframe')!.getAttribute('src')).toMatch(/youtube-nocookie\.com\/embed\//)
  })
})

describe('AnimatedDemo', () => {
  const mm = (reduce: boolean) => vi.stubGlobal('matchMedia', (q: string) => ({ matches: reduce && q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {} }))
  it('starts paused when the phone asks for reduced motion, and Play starts it', () => {
    mm(true)
    const play = vi.fn().mockResolvedValue(undefined)
    HTMLMediaElement.prototype.play = play
    HTMLMediaElement.prototype.pause = vi.fn()
    const { container } = render(<AnimatedDemo src="/x.mp4" label="Chair arm raises" />)
    expect(play).not.toHaveBeenCalled()
    expect(container.querySelector('video')!.muted).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: /Play/ }))
    expect(play).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: /Pause/ })).toBeTruthy()
  })
  it('plays by default when motion is fine, with a Pause button', () => {
    mm(false)
    const play = vi.fn().mockResolvedValue(undefined)
    HTMLMediaElement.prototype.play = play
    HTMLMediaElement.prototype.pause = vi.fn()
    render(<AnimatedDemo src="/x.mp4" label="Chair arm raises" />)
    expect(play).toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /Pause/ })).toBeTruthy()
  })
})
