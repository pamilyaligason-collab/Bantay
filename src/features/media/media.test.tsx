import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LiteVideo } from './LiteVideo'

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks() })
const setOnline = (v: boolean) => vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(v)

describe('LiteVideo', () => {
  it('an SOS unloads a playing video', () => {
    setOnline(true)
    const { container } = render(<LiteVideo id="M4ACYp75mjU" title="Hands-only CPR" />)
    fireEvent.click(screen.getByRole('button', { name: /Play/ }))
    expect(container.querySelector('iframe')).not.toBeNull()
    act(() => { window.dispatchEvent(new Event('sos:started')) })
    expect(container.querySelector('iframe')).toBeNull()
  })
  it('before the tap: no iframe, only the still picture (ytimg), title, length and a link to YouTube', () => {
    setOnline(true)
    const { container } = render(<LiteVideo id="M4ACYp75mjU" title="Hands-only CPR" minutes={5} />)
    expect(container.querySelector('iframe')).toBeNull()
    expect(container.querySelector('img')!.getAttribute('src')).toBe('https://i.ytimg.com/vi/M4ACYp75mjU/hqdefault.jpg')
    expect(container.querySelector('img')!.getAttribute('referrerpolicy')).toBe('no-referrer')
    expect(screen.getByText('5 min')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Play Hands-only CPR, 5 min' })).toBeTruthy()
    expect(screen.getByRole('link', { name: /Open in YouTube/ }).getAttribute('href')).toBe('https://www.youtube.com/watch?v=M4ACYp75mjU')
  })
  it('a picture that fails to load falls back to the drawn poster; unknown length shows no minutes', () => {
    setOnline(true)
    const { container } = render(<LiteVideo id="M4ACYp75mjU" title="Hands-only CPR" minutes={null} />)
    expect(screen.queryByText(/ min$/)).toBeNull()
    fireEvent.error(container.querySelector('img')!)
    expect(container.querySelector('img')).toBeNull()
    expect(screen.getByRole('button', { name: 'Play Hands-only CPR' })).toBeTruthy()
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
