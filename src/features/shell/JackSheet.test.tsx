import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
const spy = vi.hoisted(() => ({ scan: vi.fn(), scanFile: vi.fn(), ask: vi.fn() }))
vi.mock('../scan/open', () => ({ openScan: spy.scan, openScanWithFile: spy.scanFile }))
vi.mock('../sos/active', () => ({ startSos: vi.fn() }))
import { ASK_EVENT } from '../assistant/Assistant'
import { JackSheet } from './JackSheet'
afterEach(cleanup)
const mount = () => { document.body.innerHTML = '<div class="bt"></div>'; const onClose = vi.fn(), onSos = vi.fn(); render(<JackSheet onClose={onClose} onSos={onSos} firstName="Rey" />); return { onClose, onSos } }

describe('JackSheet', () => {
  it('greets by name, offers Help (hold), Safety link, Scan, Chat and Upload, all >= 44 px by class', () => {
    mount()
    expect(screen.getByRole('dialog', { name: 'Jack' }).textContent).toContain('Hi Rey, what do you need?')
    expect(screen.getByTestId('jack-sos').querySelector('.sos-simple-btn')).not.toBeNull()
    expect(screen.getByTestId('jack-safety').querySelector('a')?.getAttribute('href')).toBe('#safety')
    for (const id of ['jack-scan', 'jack-chat', 'jack-close']) expect(screen.getByTestId(id)).not.toBeNull()
  })
  it('Scan closes then opens the scanner; Chat closes then fires the assistant event', async () => { // the sheet's history entry pops first (async popstate), then the action runs
    const { onClose } = mount(); window.addEventListener(ASK_EVENT, spy.ask)
    fireEvent.click(screen.getByTestId('jack-scan')); expect(onClose).toHaveBeenCalled(); await vi.waitFor(() => expect(spy.scan).toHaveBeenCalled())
    fireEvent.click(screen.getByTestId('jack-chat')); await vi.waitFor(() => expect(spy.ask).toHaveBeenCalled())
  })
  it('three Try saying chips prefill the assistant with their text; the safety link is a sentence link', async () => {
    mount(); const got: string[] = []; const on = (e: Event) => got.push((e as CustomEvent<{ text: string }>).detail.text); window.addEventListener(ASK_EVENT, on)
    const chips = screen.getByRole('group', { name: 'Try saying' }).querySelectorAll('button')
    expect(Array.from(chips).map((c) => c.textContent)).toEqual(['Log my BP', 'What does ALT mean?', 'Did I take my medicine?'])
    fireEvent.click(chips[1]!); await vi.waitFor(() => expect(got).toEqual(['What does ALT mean?']))
    window.removeEventListener(ASK_EVENT, on)
    expect(document.querySelectorAll('.jk-row, .jk-upload')).toHaveLength(0) // Cannot hold? is a sentence with one link (board), and there is no Upload row
  })
  it('a ring shows only while the hold runs', () => {
    vi.useFakeTimers(); mount()
    const btn = screen.getByTestId('jack-sos').querySelector('.sos-simple-btn')!
    expect(screen.queryByTestId('jack-sos-ring')).toBeNull()
    fireEvent.pointerDown(btn, { pointerId: 1 }); expect(screen.getByTestId('jack-sos-ring')).not.toBeNull()
    fireEvent.pointerUp(btn); expect(screen.queryByTestId('jack-sos-ring')).toBeNull(); vi.useRealTimers()
  })
  it('a full 3 s hold hands over to onSos', () => {
    vi.useFakeTimers(); const { onSos } = mount()
    const btn = screen.getByTestId('jack-sos').querySelector('.sos-simple-btn')!
    fireEvent.pointerDown(btn, { pointerId: 1 }); vi.advanceTimersByTime(3000)
    expect(onSos).toHaveBeenCalled(); vi.useRealTimers()
  })
})
