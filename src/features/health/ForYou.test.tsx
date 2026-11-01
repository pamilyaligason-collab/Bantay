import 'fake-indexeddb/auto'
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ForYou } from './ForYou'
import { pickAttention } from './attention'
import type { Reading } from './ranges'

afterEach(cleanup)
const r: Reading[] = [{ personId: 'p1', test: 'ldl', value: 162, unit: 'mg/dL', takenAt: new Date().toISOString(), labLow: 0, labHigh: 130 }]
const show = (readings: Reading[]) => render(<ForYou personId="p1" readings={readings} attention={pickAttention(readings, () => undefined, new Date())} canLog onAdd={() => undefined} />)

describe('For you', () => {
  it('holds a nudge card, a video card and an article card', () => {
    show(r)
    const c = screen.getByTestId('for-you')
    expect(within(c).getByTestId('nudge').querySelector('a.nr-t')!.getAttribute('href')).toBe('#health/nudge')
    expect(within(c).getByTestId('glance-video').getAttribute('href')).toBe('#discover/watch')
    const art = within(c).getByTestId('for-you-article')
    expect(art.textContent).toContain('Because of your LDL cholesterol')
    expect(art.getAttribute('href')).toBe('#discover/learn/library/' + encodeURIComponent('s:LDL cholesterol'))
  })
  it('empty person: no nudge, no article, video stays', () => {
    show([])
    expect(screen.queryByTestId('nudge')).toBeNull()
    expect(screen.queryByTestId('for-you-article')).toBeNull()
    expect(screen.getByTestId('glance-video')).toBeTruthy()
  })
})
