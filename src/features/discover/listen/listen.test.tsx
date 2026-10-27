import 'fake-indexeddb/auto'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../../db'

const native = vi.hoisted(() => ({ on: false }))
const tts = vi.hoisted(() => ({ speak: vi.fn(), stop: vi.fn() }))
vi.mock('../../../native/shell', () => ({ hasPlugin: () => native.on }))
vi.mock('@capacitor-community/text-to-speech', () => ({ TextToSpeech: tts, QueueStrategy: { Flush: 0, Add: 1 } }))

import Listen from './Screen'
import { canSpeak, speak, stopSpeaking } from './speech'

class Utter { text: string; rate = 1; lang = ''; onend: (() => void) | null = null; onerror: (() => void) | null = null; constructor(t: string) { this.text = t } }
const synth = { speak: vi.fn(), cancel: vi.fn() }
const withWeb = () => { vi.stubGlobal('SpeechSynthesisUtterance', Utter); Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: synth }) }
const noWeb = () => { vi.stubGlobal('SpeechSynthesisUtterance', undefined); Reflect.deleteProperty(window, 'speechSynthesis') }

beforeEach(async () => { native.on = false; tts.speak.mockReset().mockResolvedValue(undefined); tts.stop.mockReset().mockResolvedValue(undefined); synth.speak.mockReset(); synth.cancel.mockReset(); await db.kv.clear() })
afterEach(() => { cleanup(); vi.unstubAllGlobals(); Reflect.deleteProperty(window, 'speechSynthesis') })

describe('speech', () => {
  it('native: the TTS plugin speaks at rate 0.9 and stop calls the plugin', async () => {
    native.on = true
    expect(canSpeak()).toBe(true)
    await speak('Hello there')
    expect(tts.speak).toHaveBeenCalledWith(expect.objectContaining({ text: 'Hello there', rate: 0.9, lang: 'en-US' }))
    await stopSpeaking()
    expect(tts.stop).toHaveBeenCalledTimes(1)
    expect(synth.speak).not.toHaveBeenCalled()
  })
  it('web: speechSynthesis speaks at rate 0.9, resolves when the voice ends, and cancel stops it', async () => {
    withWeb()
    expect(canSpeak()).toBe(true)
    let done = false
    const p = speak('Magandang araw').then(() => { done = true })
    const u = synth.speak.mock.calls[0]![0] as Utter
    expect(u.text).toBe('Magandang araw')
    expect(u.rate).toBe(0.9)
    await Promise.resolve()
    expect(done).toBe(false)
    u.onend!()
    await p
    expect(done).toBe(true)
    await stopSpeaking()
    expect(synth.cancel).toHaveBeenCalled()
    expect(tts.speak).not.toHaveBeenCalled()
  })
  it('neither: speak and stop do nothing and do not throw', async () => {
    noWeb()
    expect(canSpeak()).toBe(false)
    await expect(speak('x')).resolves.toBeUndefined()
    await expect(stopSpeaking()).resolves.toBeUndefined()
    expect(tts.speak).not.toHaveBeenCalled()
  })
})

describe('Listen screen', () => {
  it('lists the 20 recipes and no medicine card while the flag is off', async () => {
    withWeb()
    render(<Listen />)
    expect((await screen.findAllByRole('button', { name: /^Play / })).length).toBe(20)
    expect(screen.queryByRole('button', { name: /^Play Losartan/ })).toBeNull()
  })
  it('medicine cards join the list only when learn.medcards is true', async () => {
    withWeb()
    await db.kv.put({ key: 'learn.medcards', value: true })
    render(<Listen />)
    expect(await screen.findByRole('button', { name: /^Play Losartan/ })).toBeTruthy()
  })
  it('one at a time: starting a second stops the first; Stop ends it; unmount cuts the voice', async () => {
    withWeb()
    const { unmount } = render(<Listen />)
    const [a, b] = await screen.findAllByRole('button', { name: /^Play / })
    await act(async () => { fireEvent.click(a!) })
    expect(a!.getAttribute('aria-pressed')).toBe('true')
    await act(async () => { fireEvent.click(b!) })
    expect(a!.getAttribute('aria-pressed')).toBe('false')
    expect(b!.getAttribute('aria-pressed')).toBe('true')
    expect(screen.getAllByRole('button', { pressed: true }).length).toBe(1)
    await act(async () => { fireEvent.click(b!) })
    expect(b!.getAttribute('aria-pressed')).toBe('false')
    const cancels = synth.cancel.mock.calls.length
    await act(async () => { fireEvent.click(a!) })
    unmount()
    expect(synth.cancel.mock.calls.length).toBeGreaterThan(cancels)
  })
  it('a phone with no voice says so instead of showing dead buttons', () => {
    noWeb()
    render(<Listen />)
    expect(screen.getByText('Reading aloud is not on this phone')).toBeTruthy()
    expect(screen.queryAllByRole('button').length).toBe(0)
  })
})
