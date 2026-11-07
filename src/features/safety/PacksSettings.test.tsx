import 'fake-indexeddb/auto'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import PacksSettings from './PacksSettings'

afterEach(cleanup)

describe('PacksSettings credits', () => {
  it('credits the hazard data and the area outlines (public/geo/units.json ships)', () => {
    render(<PacksSettings />)
    const t = screen.getByTestId('packs-settings').textContent ?? ''
    expect(t).toContain('UP NOAH Center (Project NOAH), ODbL 1.0')
    expect(t).toContain('Area outlines: geoBoundaries, CC BY 3.0 IGO')
  })
})
