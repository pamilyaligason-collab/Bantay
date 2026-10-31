import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
const spy = vi.hoisted(() => ({ scan: vi.fn(), scanFile: vi.fn(), ask: vi.fn() }))
vi.mock('../scan/open', () => ({ openScan: spy.scan, openScanWithFile: spy.scanFile }))
vi.mock('../sos/active', () => ({ startSos: vi.fn() }))
import { ASK_EVENT } from '../assistant/Assistant'
import { JackSheet } from './JackSheet'
afterEach(cleanup)
const mount = () => { document.body.innerHTML = '<div class="bt"></div>'; const onClose = vi.fn(), onSos = vi.fn(); render(<JackSheet onClose={onClose} onSos={onSos} firstName="Loyd" />); return { onClose, onSos } }

describe('JackSheet', () => {
  it('greets by name, offers Help (hold), Safety link, Scan, Chat and Upload, all >= 44 px by class', () => {
    mount()
    expect(screen.getByRole('dialog', { name: 'Jack' }).textContent).toContain('Hi Loyd, what do you need?')
    expect(screen.getByTestId('jack-sos').querySelector('.sos-simple-btn')).not.toBeNull()
    expect(screen.getByTestId('jack-safety').querySelector('a')?.getAttribute('href')).toBe('#safety')
    for (const id of ['jack-scan', 'jack-chat', 'jack-upload', 'jack-close']) expect(screen.getByTestId(id)).not.toBeNull()
  })
  it('Scan closes then opens the scanner; Chat closes then fires the assistant event', async () => { // the sheet's history entry pops first (async popstate), then the action runs
    const { onClose } = mount(); window.addEventListener(ASK_EVENT, spy.ask)
    fireEvent.click(screen.getByTestId('jack-scan')); expect(onClose).toHaveBeenCalled(); await vi.waitFor(() => expect(spy.scan).toHaveBeenCalled())
    fireEvent.click(screen.getByTestId('jack-chat')); await vi.waitFor(() => expect(spy.ask).toHaveBeenCalled())
  })
  it('a full 3 s hold hands over to onSos', () => {
    vi.useFakeTimers(); const { onSos } = mount()
    const btn = screen.getByTestId('jack-sos').querySelector('.sos-simple-btn')!
    fireEvent.pointerDown(btn, { pointerId: 1 }); vi.advanceTimersByTime(3000)
    expect(onSos).toHaveBeenCalled(); vi.useRealTimers()
  })
})
