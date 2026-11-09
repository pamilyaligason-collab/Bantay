import 'fake-indexeddb/auto'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import css from './lock.css?raw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../db'
import { over, parse, ratio as rat } from '../look/contrastMath'

const h = vi.hoisted(() => ({ prompt: vi.fn(), mode: vi.fn(), enrol: vi.fn() }))
vi.mock('./biometric', () => ({ promptFingerprint: h.prompt, unlockMode: h.mode, openFingerprintEnrol: h.enrol }))
import { FingerOffer, LockScreen } from './FingerGate'

beforeEach(async () => { await db.kv.clear(); localStorage.clear(); h.prompt.mockReset(); h.mode.mockReset(); h.enrol.mockReset() })
afterEach(() => cleanup())

describe('LockScreen', () => {
  it('prompts at once and opens the app on success', async () => {
    h.prompt.mockResolvedValue(true)
    const onUnlocked = vi.fn()
    render(<LockScreen name="Mama" onUnlocked={onUnlocked} onUsePin={() => {}} onNotYou={() => {}} />)
    await waitFor(() => expect(onUnlocked).toHaveBeenCalledTimes(1))
    expect(h.prompt).toHaveBeenCalledTimes(1)
  })
  it('on a miss stays locked and offers PIN and Not you', async () => {
    h.prompt.mockResolvedValue(false)
    const onUnlocked = vi.fn(), onUsePin = vi.fn(), onNotYou = vi.fn()
    render(<LockScreen name="Mama" onUnlocked={onUnlocked} onUsePin={onUsePin} onNotYou={onNotYou} />)
    expect((await screen.findByRole('alert')).textContent).toMatch(/did not work/)
    fireEvent.click(screen.getByRole('button', { name: 'Use PIN instead' }))
    fireEvent.click(screen.getByRole('button', { name: 'Not Mama?' }))
    expect(onUnlocked).not.toHaveBeenCalled()
    expect(onUsePin).toHaveBeenCalledTimes(1); expect(onNotYou).toHaveBeenCalledTimes(1)
  })
})

describe('LockScreen name (D-142)', () => {
  it('greets and asks Not with a capitalised first name even when the family list holds it lower-case', () => {
    render(<LockScreen name="tala" onUnlocked={() => {}} onUsePin={() => {}} onNotYou={() => {}} />)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/, Tala$/)
    expect(screen.getByRole('button', { name: 'Not Tala?' })).toBeTruthy()
  })
})

describe('LockScreen start-finger', () => {
  const hang = () => h.prompt.mockReturnValue(new Promise(() => {}))
  it('greets by name, shows Call 911 as the dial screen, and no PIN or private data', async () => {
    hang()
    render(<LockScreen name="Mama" onUnlocked={() => {}} onUsePin={() => {}} onNotYou={() => {}} />)
    expect(screen.getByRole('heading').textContent).toMatch(/^Magandang (umaga|hapon|gabi), Mama$/)
    expect(screen.getByText('Touch the fingerprint sensor')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Call 911' }).getAttribute('href')).toBe('tel:911')
    expect(screen.getByRole('button', { name: 'Not Mama?' })).toBeTruthy()
  })
  it('fingerprint button has an accessible name and asks again on tap; Use PIN instead signs out', () => {
    hang()
    const onUsePin = vi.fn()
    render(<LockScreen name="Mama" onUnlocked={() => {}} onUsePin={onUsePin} onNotYou={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Unlock with fingerprint' }))
    expect(h.prompt).toHaveBeenCalledTimes(2)
    fireEvent.click(screen.getByRole('button', { name: 'Use PIN instead' }))
    expect(onUsePin).toHaveBeenCalledTimes(1)
  })
  it('shows a clock, and no name in the greeting when there is none', () => {
    hang()
    render(<LockScreen name="" onUnlocked={() => {}} onUsePin={() => {}} onNotYou={() => {}} />)
    expect(screen.getByLabelText('Time now').textContent).toMatch(/^\d{1,2}:\d{2}$/)
    expect(screen.getByRole('heading').textContent).toMatch(/^Magandang (umaga|hapon|gabi)$/)
  })
  it('reduced motion adds the still class (no fog drift, no halo)', () => {
    hang()
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }))
    const { container } = render(<LockScreen name="Mama" onUnlocked={() => {}} onUsePin={() => {}} onNotYou={() => {}} />)
    expect(container.querySelector('main')?.className).toContain('lk2-still')
    vi.unstubAllGlobals()
    cleanup()
    const r = render(<LockScreen name="Mama" onUnlocked={() => {}} onUsePin={() => {}} onNotYou={() => {}} />)
    expect(r.container.querySelector('main')?.className).not.toContain('lk2-still')
  })
  it('reduced motion renders no halo at all; normal motion renders it', () => {
    hang()
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }))
    const still = render(<LockScreen name="Mama" onUnlocked={() => {}} onUsePin={() => {}} onNotYou={() => {}} />)
    expect(still.container.querySelector('.lk2-halo')).toBeNull()
    vi.unstubAllGlobals()
    cleanup()
    const live = render(<LockScreen name="Mama" onUnlocked={() => {}} onUsePin={() => {}} onNotYou={() => {}} />)
    expect(live.container.querySelector('.lk2-halo')).not.toBeNull()
  })
  it('Medical ID is the outlined button', () => {
    hang()
    render(<LockScreen name="Mama" onUnlocked={() => {}} onUsePin={() => {}} onNotYou={() => {}} />)
    expect(screen.getByRole('button', { name: 'Medical ID' }).className).toContain('lk2-out')
  })
  it('shows the weather glance from the cached forecast, nothing when none is cached or it is old', async () => {
    hang()
    const fc = (at: number) => ({ fetchedAt: new Date(at).toISOString(), tz: 'Asia/Manila', utcOffset: 28800, current: { time: '', temp: 30.6, humidity: 70, feels: 36, code: 2, wind: 10, gust: 20, uv: 6 }, hourly: [], daily: [] })
    render(<LockScreen name="Mama" onUnlocked={() => {}} onUsePin={() => {}} onNotYou={() => {}} />)
    expect(screen.queryByText(/partly cloudy/)).toBeNull()
    cleanup()
    await db.kv.put({ key: 'weather.forecast.6.11,125.17', value: fc(Date.now() - 20 * 3600_000) })
    render(<LockScreen name="Mama" onUnlocked={() => {}} onUsePin={() => {}} onNotYou={() => {}} />)
    await new Promise((r) => setTimeout(r, 30))
    expect(screen.queryByText(/partly cloudy/)).toBeNull()
    cleanup()
    await db.kv.put({ key: 'weather.forecast.6.11,125.17', value: fc(Date.now()) })
    render(<LockScreen name="Mama" onUnlocked={() => {}} onUsePin={() => {}} onNotYou={() => {}} />)
    expect(await screen.findByText('31° partly cloudy')).toBeTruthy()
  })
  it('names the place when the cached forecast is for a home zone', async () => {
    hang()
    await db.kv.put({ key: 'weather.forecast.6.2,125.19', value: { fetchedAt: new Date().toISOString(), tz: 'Asia/Manila', utcOffset: 28800, current: { time: '', temp: 30.6, humidity: 70, feels: 36, code: 2, wind: 10, gust: 20, uv: 6 }, hourly: [], daily: [] } })
    render(<LockScreen name="Mama" onUnlocked={() => {}} onUsePin={() => {}} onNotYou={() => {}} />)
    expect(await screen.findByText('Conel, General Santos City')).toBeTruthy()
  })
  it('Medical ID on a shared phone never shows the previous person\'s cached card', async () => {
    hang()
    await db.kv.put({ key: 'medid.cache', value: { personId: 'pOld', at: 1, card: { name: 'Lolo', age: 80, allergies: ['Aspirin'], conditions: [], medicines: [], calls: [], missing: [] } } })
    render(<LockScreen name="Mama" personId="pNew" onUnlocked={() => {}} onUsePin={() => {}} onNotYou={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Medical ID' }))
    expect(await screen.findByText('Nothing saved on this phone yet')).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/Aspirin|Lolo/)
  })
  it('Medical ID opens without unlocking and shows allergies, conditions and who to call only', async () => {
    hang()
    await db.kv.put({ key: 'medid.cache', value: { personId: 'p1', at: 1, card: { name: 'Mama', age: 68, bloodType: 'O+', allergies: ['Penicillin'], conditions: ['Diabetes'], medicines: ['Losartan 50 mg'], calls: [{ name: 'Papa', phone: '0917 123 4567' }], missing: [] } } })
    const onUnlocked = vi.fn()
    render(<LockScreen name="Mama" onUnlocked={onUnlocked} onUsePin={() => {}} onNotYou={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Medical ID' }))
    expect(await screen.findByText('Penicillin')).toBeTruthy()
    expect(screen.getByText('Diabetes')).toBeTruthy()
    expect(screen.getByRole('link', { name: /Papa/ }).getAttribute('href')).toBe('tel:09171234567')
    expect(document.body.textContent).not.toMatch(/O\+|Losartan/)
    expect(onUnlocked).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(screen.getByText('Touch the fingerprint sensor')).toBeTruthy()
  })
})

describe('LockScreen negative button', () => {
  it("'use_pin' opens the PIN pad at once, no second tap", async () => {
    h.prompt.mockResolvedValue('use_pin')
    const onUsePin = vi.fn()
    render(<LockScreen name="Mama" onUnlocked={() => {}} onUsePin={onUsePin} onNotYou={() => {}} />)
    await waitFor(() => expect(onUsePin).toHaveBeenCalledTimes(1))
  })
})

describe('FingerOffer', () => {
  it('turns the fingerprint on after a successful prompt', async () => {
    h.mode.mockResolvedValue('fingerprint'); h.prompt.mockResolvedValue(true)
    const onDone = vi.fn()
    render(<FingerOffer personId="p1" onDone={onDone} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Turn on fingerprint' }))
    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(localStorage.getItem('bantay.passkey.p1')).toBe('1')
  })
  it('nothing enrolled: says so and opens Settings, or uses PIN each time', async () => {
    h.mode.mockResolvedValue('enrol-first')
    const onDone = vi.fn()
    render(<FingerOffer personId="p1" onDone={onDone} />)
    expect(await screen.findByText('Set up a fingerprint in Settings first.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Open Settings' }))
    expect(h.enrol).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Use PIN each time' }))
    expect(onDone).toHaveBeenCalled()
    expect(localStorage.getItem('bantay.passkey.p1')).toBeNull()
  })
  it('no sensor: skips itself', async () => {
    h.mode.mockResolvedValue('pin')
    const onDone = vi.fn()
    render(<FingerOffer personId="p1" onDone={onDone} />)
    await waitFor(() => expect(onDone).toHaveBeenCalled())
  })
})

describe('lock.css', () => {
  const lin = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  const lum = (h: string) => { const [r, g, b] = lin(h); return 0.2126 * r + 0.7152 * g + 0.0722 * b }
  const ratio = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }
  const mix = (f: string, a: number, b: string) => '#' + [1, 3, 5].map((i) => Math.round(a * parseInt(f.slice(i, i + 2), 16) + (1 - a) * parseInt(b.slice(i, i + 2), 16)).toString(16).padStart(2, '0')).join('')
  const tok = (block: string, name: string) => new RegExp(`--lk-${name}: (#[0-9A-Fa-f]{6})`).exec(block)![1]
  const lines = css.split(/\r?\n/)
  const light = lines[1]
  const dark = lines.find((l) => l.startsWith(':root[data-theme="dark"] .lk2 {'))!
  const media = lines.find((l) => l.startsWith('@media (prefers-color-scheme: dark)') && l.includes('--lk-sky-a'))!
  // hand-computed WCAG ratios: white on sky-a, white on sky-b, white on chip, glass ink over sky-a / sky-b
  const cases: [string, string, number[]][] = [['light', light, [6.78, 5.07, 12.27, 8.89, 9.65]], ['dark', dark, [14.64, 12.05, 17.51, 13.43, 12.15]]]
  it.each(cases)('%s: every text pair is at least 4.5:1 (clock and date sit on the top band)', (_n, b, want) => {
    const a = tok(b, 'sky-a'), s = tok(b, 'sky-b'), chip = tok(b, 'chip'), ink = tok(b, 'glass-ink')
    const alpha = Number(/--lk-glass: rgba\((\d+), (\d+), (\d+), ([.\d]+)\)/.exec(b)![4])
    const gl = _n === 'light' ? '#ffffff' : '#142028'
    const got = [ratio('#ffffff', a), ratio('#ffffff', s), ratio('#ffffff', chip), ratio(ink, mix(gl, alpha, a)), ratio(ink, mix(gl, alpha, s))]
    got.forEach((g, i) => { expect(g).toBeGreaterThanOrEqual(4.5); expect(Math.abs(g - want[i])).toBeLessThan(0.15) })
  })
  it('white on the red Call 911 button passes (hand value 6.57)', () => { expect(ratio('#ffffff', '#B42318')).toBeGreaterThan(6.5) })
  it('S26 frosted glass: chip and links blur the backdrop, with a solid fallback outside @supports', () => {
    expect(css).toMatch(/@supports \(\(-webkit-backdrop-filter: blur\(1px\)\) or \(backdrop-filter: blur\(1px\)\)\) \{\s*\.lk2-say, \.lk2-mid \.lk2-lnk \{[^}]*backdrop-filter: blur\(20px\)/)
    expect(css).toMatch(/\.lk2-say \{[^}]*background: var\(--lk-chip\)/)
    expect(css).toMatch(/\.lk2-lnk \{[^}]*background: var\(--lk-chip\)/)
  })
  it.each(['light', 'dark'])('S26 frosted glass %s: white text is >= 4.5:1 over the frost on a pure white backdrop (lighter than any sky stop plus fog) and on the lightest sky stop', (n) => {
    const sel = n === 'light' ? '\\.lk2 \\{ --lk-frost: (rgba\\([^)]*\\))' : ':root\\[data-theme="dark"\\] \\.lk2 \\{ --lk-frost: (rgba\\([^)]*\\))'
    const frost = parse(new RegExp(sel).exec(css)![1]!)
    for (const back of [[255, 255, 255], [232, 228, 216]] as [number, number, number][]) expect(rat([255, 255, 255], over(frost, back))).toBeGreaterThanOrEqual(4.5)
  })
  it('S26: the failed-attempt text is 17 px', () => { expect(css).toMatch(/\.lk2-say \[role="alert"\] \{ font-size: 17px/) })
  it('dark tokens are repeated under prefers-color-scheme dark', () => { expect(media).toContain(tok(dark, 'sky-a')); expect(media).toContain(tok(dark, 'chip')) })
  it('emergency targets keep 60px; the halo and fog are off under reduced motion; dark fingerprint override exists', () => {
    expect(css).toMatch(/\.lk2-sos \.lk2-lnk \{ min-height: 60px/)
    expect(css).toMatch(/prefers-reduced-motion: reduce\) \{ \.lk2-fog \{ animation: none; \} \.lk2-halo \{ display: none; \}/)
    expect(css).toMatch(/\.lk2-still \.lk2-halo \{ display: none; \}/)
    expect(css).toMatch(/prefers-color-scheme: dark\) \{ :root:not\(\[data-theme="light"\]\) \.lk2-fp/)
  })
})
