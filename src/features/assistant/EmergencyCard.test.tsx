import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { EmergencyCard } from './EmergencyCard'

afterEach(cleanup)
const labels = () => [...document.querySelectorAll('.as-emerg button, .as-emerg a')].map((e) => (e.textContent ?? '').trim())
const card = (call: string[], kind = 'selfharm') => render(<EmergencyCard e={{ kind, call, text: 'x' }} onSos={() => {}} />)

// S30 L8 r2 (D1): 988 takes calls and texts; the self-harm card shows 988 above 911, in the US and both-regions variants.
describe('EmergencyCard crisis buttons', () => {
  it('US: Call 988, Text 988 (sms:988), then Call 911, then SOS; never 1553', () => {
    card(['988', '911'])
    expect(labels()).toEqual(['Call 988 (crisis line, free)', 'Text 988', 'Call 911', 'Tell my family (SOS)'])
    expect(screen.getByRole('link', { name: 'Text 988' }).getAttribute('href')).toBe('sms:988')
  })
  it('both regions (place unknown): Call 988, Text 988, Call 1553, then Call 911', () => {
    card(['988', '1553', '911'])
    expect(labels()).toEqual(['Call 988 (crisis line, free)', 'Text 988', 'Call 1553 (crisis line, free)', 'Call 911', 'Tell my family (SOS)'])
  })
  it('Philippines: Call 1553 then Call 911, no text button (1553 has none)', () => {
    card(['1553', '911'])
    expect(labels()).toEqual(['Call 1553 (crisis line, free)', 'Call 911', 'Tell my family (SOS)'])
    expect(screen.queryByRole('link', { name: 'Text 988' })).toBeNull()
  })
  it('any other emergency: Call 911 stays the first and primary button', () => {
    card(['911'], 'chest')
    expect(labels()).toEqual(['Call 911', 'Tell my family (SOS)'])
    expect(screen.getByRole('button', { name: 'Call 911' }).className).toBe('as-911')
  })
})
