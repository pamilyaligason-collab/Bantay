import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import HazardPage from './HazardsPage'

vi.mock('./store', () => ({ useKv: (_k: string, fb: unknown) => fb }))
afterEach(cleanup)

const dampas = { weather: { lat: 9.645705, lon: 123.877951 }, zone: 'dampas', source: 'zone' } as never
const conel = { weather: { lat: 6.2015121, lon: 125.1878084 }, zone: 'conel', source: 'zone' } as never

describe('HazardsPage', () => {
  it('Dampas: zone card, layer switch, earthquake row, closest help and both links', () => {
    render(<HazardPage place={dampas} />)
    expect(screen.getByTestId('hazards-zone').textContent).toContain('Dampas, Tagbilaran City')
    expect(screen.getByRole('group', { name: 'Hazard layer' })).toBeTruthy()
    expect(screen.getAllByText(/very destructive shaking/).length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText('Dampas Barangay Health Station')).toBeTruthy()
    expect(screen.getByRole('link', { name: /Open HazardHunterPH/ }).getAttribute('href')).toBe('https://hazardhunter.georisk.gov.ph/')
    expect(screen.getByRole('link', { name: /Open in NOAH/ }).getAttribute('href')).toBe('https://noah.up.edu.ph/')
    expect(screen.getByText(/Read 17 Oct 2026 · Dampas only/)).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Map of your place' })).toBeTruthy()
  })
  it('the layer switch changes the caption only', () => {
    render(<HazardPage place={dampas} />)
    const cap = () => screen.getByTestId('layer-caption').textContent
    expect(cap()).toContain('No flood map for this place yet')
    fireEvent.click(screen.getByRole('button', { name: 'Landslide' }))
    expect(cap()).toContain('Landslide reading from HazardHunterPH: Low')
    fireEvent.click(screen.getByRole('button', { name: 'Storm surge' }))
    expect(cap()).toContain('Safe')
    expect(screen.getAllByRole('region', { name: 'Map of your place' }).length).toBe(1)
  })
  it('Conel: empty state and still the two links', () => {
    render(<HazardPage place={conel} />)
    expect(screen.getByRole('status').textContent).toContain('No hazard readings for this zone yet')
    expect(screen.getByRole('link', { name: /Open HazardHunterPH/ })).toBeTruthy()
    expect(screen.getByRole('link', { name: /Open in NOAH/ })).toBeTruthy()
    expect(screen.queryByRole('group', { name: 'Hazard layer' })).toBeNull()
  })
})
