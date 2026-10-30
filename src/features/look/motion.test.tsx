// @vitest-environment jsdom
import { act, render } from '@testing-library/react'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { momentAt, PATTERNS } from '../today/breathLogic'
import WeatherScene from '../weather/WeatherScene'
import { Aurora } from './Aurora'
import { BreathOrb } from './BreathOrb'
import { CheckDraw } from './CheckDraw'
import { CountUp } from './CountUp'
import { wireMotion, springIn, motionOk, setSosScreenOpen } from './motion'
import { Ring, ringDash } from './Ring'

const reduce = () => vi.stubGlobal('matchMedia', (q: string) => ({ matches: true, media: q, addEventListener() {}, removeEventListener() {} }))
const realGetContext = HTMLCanvasElement.prototype.getContext
afterEach(() => { vi.unstubAllGlobals(); HTMLCanvasElement.prototype.getContext = realGetContext; location.hash = '' })

describe('reduced motion', () => {
  it('CountUp renders the final value', () => {
    reduce()
    const { container } = render(<CountUp to={1234} />)
    expect(container.textContent).toBe((1234).toLocaleString())
  })
  it('CountUp shows a dash for unknown, not 0', () => {
    reduce()
    expect(render(<CountUp to={null} />).container.textContent).toBe('–')
  })
  it('wireMotion changes nothing and observes nothing', () => {
    reduce()
    const io = vi.fn()
    vi.stubGlobal('IntersectionObserver', io)
    document.body.innerHTML = '<div id="r"><p data-reveal>a</p><b data-count="42">7</b></div>'
    wireMotion(document.getElementById('r'))()
    expect(io).not.toHaveBeenCalled()
    expect(document.querySelector('b')!.textContent).toBe('7')
  })
  it('springIn does not animate', () => {
    reduce()
    const el = document.createElement('div')
    const a = vi.fn()
    el.animate = a as never
    springIn(el, 1)
    expect(a).not.toHaveBeenCalled()
  })
})

// ---- S16 L9 ----
vi.mock('../family/sosActive', () => ({ useSosActive: () => false }))
const still = () => vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {} }))
const calm = PATTERNS.find((p) => p.id === 'calm')!

describe('Ring math', () => {
  it('fill is value x circumference, clamped, NaN is empty', () => {
    const len = 2 * Math.PI * (28 / 2 - 3)
    expect(ringDash(0.5, 28)).toEqual({ v: 0.5, len, fill: len * 0.5 })
    expect(ringDash(3, 20).v).toBe(1)
    expect(ringDash(-1, 20).fill).toBe(0)
    expect(ringDash(Number.NaN, 40).fill).toBe(0)
    const { container } = render(<Ring value={0.25} size={40} />)
    const l = 2 * Math.PI * 17
    expect(container.querySelector('.rg-val')!.getAttribute('stroke-dasharray')).toBe(`${l * 0.25} ${l}`)
  })
})

describe('BreathOrb at fixed moments (reduced: sits at the size for the moment)', () => {
  it.each([[2, 'in', 'scale(0.775)', '2'], [5, 'hold', 'scale(1)', '3'], [10, 'out', 'scale(0.775)', '2'], [13, 'rest', 'scale(0.55)', '3']])('%is is %s', (t, phase, tf, left) => {
    const m = momentAt(calm, 1, t)
    const { container } = render(<BreathOrb moment={m} reduced />)
    expect(m.phase).toBe(phase)
    expect((container.querySelector('.bo-orb') as HTMLElement).style.transform).toBe(tf)
    expect(container.querySelector('.bo-count')!.textContent).toBe(left)
    expect(container.querySelector('[role=status]')!.textContent).toBeTruthy()
  })
  it('done shows Done and no count', () => {
    const { container } = render(<BreathOrb moment={momentAt(calm, 1, 9999)} reduced />)
    expect(container.querySelector('[role=status]')!.textContent).toBe('Done')
    expect(container.querySelector('.bo-count')).toBeNull()
  })
})

describe('CheckDraw', () => {
  it('under reduced motion the tick is there and onDone fires once at once', () => {
    still()
    const done = vi.fn()
    const { container } = render(<CheckDraw onDone={done} />)
    expect(container.querySelector('path')).toBeTruthy()
    expect(done).toHaveBeenCalledTimes(1)
  })
})

describe('Aurora: never a canvas where it must not be', () => {
  const caps = (hw = 8) => { vi.stubGlobal('navigator', { hardwareConcurrency: hw }); const gl = new Proxy({}, { get: (_t, k) => (k === 'getProgramParameter' ? () => true : k === 'getExtension' ? () => ({ loseContext() {} }) : typeof k === 'string' && /^[A-Z_0-9]+$/.test(k) ? 1 : () => ({})) }); HTMLCanvasElement.prototype.getContext = (() => gl) as never }
  it('no WebGL2 or a low-end phone: static gradient only', () => {
    vi.stubGlobal('navigator', { hardwareConcurrency: 8 })
    HTMLCanvasElement.prototype.getContext = (() => null) as never
    location.hash = '#discover'
    expect(render(<Aurora />).container.querySelector('canvas')).toBeNull()
    caps(2)
    expect(render(<Aurora />).container.querySelector('canvas')).toBeNull()
  })
  it('on Today, on #safety*, under reduced motion and while the SOS screen is open: no canvas', () => {
    caps()
    location.hash = '#today'
    expect(render(<Aurora />).container.querySelector('canvas')).toBeNull()
    location.hash = '#safety/warnings'
    expect(render(<Aurora />).container.querySelector('canvas')).toBeNull()
    location.hash = '#discover'
    still()
    expect(render(<Aurora />).container.querySelector('canvas')).toBeNull()
    vi.unstubAllGlobals(); caps()
    act(() => setSosScreenOpen(true))
    expect(render(<Aurora />).container.querySelector('canvas')).toBeNull()
    act(() => setSosScreenOpen(false))
    expect(render(<Aurora />).container.querySelector('canvas')).not.toBeNull()
  })
})

describe('WeatherScene stillness', () => {
  it('moves normally; still under reduced motion (8 streaks) and while the SOS screen is open', () => {
    location.hash = '#today'
    const { container, unmount } = render(<WeatherScene tod="day" cond="rain" />)
    const el = () => container.querySelector('.wxs') as HTMLElement
    expect(el().dataset.still).toBeUndefined()
    expect(container.querySelectorAll('.wxs-rain i')).toHaveLength(18)
    expect(container.querySelectorAll('.wxs-near').length).toBeGreaterThan(0)
    expect(container.querySelectorAll('.wxs-far').length).toBeGreaterThan(0)
    expect((container.querySelector('.wxs-cloud') as HTMLElement).style.animationDelay.startsWith('-')).toBe(true) // negative delays
    act(() => setSosScreenOpen(true))
    expect(el().dataset.still).toBe('1')
    expect(container.querySelectorAll('.wxs-rain i')).toHaveLength(8)
    act(() => setSosScreenOpen(false))
    expect(el().dataset.still).toBeUndefined()
    unmount()
    still()
    expect(render(<WeatherScene tod="night" cond="storm" />).container.querySelector('.wxs')!.getAttribute('data-still')).toBe('1')
  })
  it('#safety* is still and never draws a canvas; heat adds the shimmer band', () => {
    location.hash = '#safety'
    const { container } = render(<WeatherScene tod="day" cond="clear" hot />)
    expect(container.querySelector('.wxs')!.getAttribute('data-still')).toBe('1')
    expect(container.querySelector('canvas')).toBeNull()
    expect(container.querySelector('.wxs-shimmer')).toBeTruthy()
  })
  it('motionOk is false while the SOS screen is up', () => {
    vi.unstubAllGlobals()
    expect(motionOk()).toBe(true)
    setSosScreenOpen(true)
    expect(motionOk()).toBe(false)
    setSosScreenOpen(false)
  })
})

describe('WeatherScene pause', () => {
  it('pauses (data-paused) when scrolled off screen or the page is hidden, and resumes', () => {
    location.hash = '#today'
    let cb: (e: Array<{ isIntersecting: boolean }>) => void = () => undefined
    vi.stubGlobal('IntersectionObserver', class { constructor(f: typeof cb) { cb = f } observe() {} disconnect() {} })
    const { container } = render(<WeatherScene tod="day" cond="rain" />)
    const el = () => container.querySelector('.wxs') as HTMLElement
    expect(el().dataset.paused).toBeUndefined()
    act(() => cb([{ isIntersecting: false }]))
    expect(el().dataset.paused).toBe('1')
    act(() => cb([{ isIntersecting: true }]))
    expect(el().dataset.paused).toBeUndefined()
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
    act(() => { document.dispatchEvent(new Event('visibilitychange')) })
    expect(el().dataset.paused).toBe('1')
    hidden.mockReturnValue(false)
    act(() => { document.dispatchEvent(new Event('visibilitychange')) })
    expect(el().dataset.paused).toBeUndefined()
    hidden.mockRestore()
  })
  it('Aurora draws no canvas when the hash moves to Today after mount', () => {
    vi.stubGlobal('navigator', { hardwareConcurrency: 8 })
    const gl = new Proxy({}, { get: (_t, k) => (k === 'getProgramParameter' ? () => true : k === 'getExtension' ? () => ({ loseContext() {} }) : typeof k === 'string' && /^[A-Z_0-9]+$/.test(k) ? 1 : () => ({})) })
    HTMLCanvasElement.prototype.getContext = (() => gl) as never
    location.hash = '#discover'
    const { container } = render(<Aurora />)
    expect(container.querySelector('canvas')).not.toBeNull()
    act(() => { location.hash = '#today'; window.dispatchEvent(new HashChangeEvent('hashchange')) })
    expect(container.querySelector('canvas')).toBeNull()
  })
})

describe('offline art', () => {
  it('the service worker precache glob covers every Jack size JackArt can load', () => {
    const cfg = readFileSync('vite.config.ts', 'utf8')
    const m = /jack-\*-\{([\d,]+)\}-\*\.webp/.exec(cfg)
    expect(m, 'precache pattern').toBeTruthy()
    expect(m![1].split(',').sort()).toEqual(['128', '256', '384'])
  })
})

describe('lazy chunk budgets (KB gz) over dist/ after vite build', () => {
  it.skipIf(!existsSync('dist/assets'))('gsap and any Aurora chunk stay within budget', () => {
    const gz = (f: string) => gzipSync(readFileSync(`dist/assets/${f}`)).length / 1024
    for (const f of readdirSync('dist/assets').filter((x) => x.endsWith('.js'))) {
      if (/^gsap/i.test(f)) expect(gz(f), f).toBeLessThanOrEqual(40)
      if (/^aurora/i.test(f)) expect(gz(f), f).toBeLessThanOrEqual(12)
    }
  })
})
