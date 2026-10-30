import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { clampJack, JACK_ALT, JackArt, jackSrc, type JackName } from './JackArt'

describe('JackArt', () => {
  it('snaps every size to 56, 96 or 112 and picks 256 for 56, 384 above', () => {
    expect([40, 48, 56, 64, 72, 76, 77, 88, 96, 104, 105, 112, 150].map(clampJack)).toEqual([56, 56, 56, 56, 56, 56, 96, 96, 96, 96, 112, 112, 112])
    const { container } = render(<JackArt name="hello" size={48} />)
    expect(container.querySelector('img')!.getAttribute('width')).toBe('56')
    expect(container.querySelector('img')!.getAttribute('src')).toBe(jackSrc('hello', 256))
  })

  it('has a 256 and a 384 file for every name, and the head has a 128', () => {
    for (const name of Object.keys(JACK_ALT) as JackName[]) {
      expect(jackSrc(name, 256), name).toBeTruthy()
      expect(jackSrc(name, 384), name).toBeTruthy()
    }
    expect(jackSrc('head', 128)).toBeTruthy()
  })

  it('renders a fixed, lazy box with alt text, or an empty alt when decorative', () => {
    const { container, rerender } = render(<JackArt name="well-done" size={120} />)
    const img = container.querySelector('img')!
    expect(img.getAttribute('width')).toBe('112')
    expect(img.getAttribute('height')).toBe('112')
    expect(img.getAttribute('loading')).toBe('lazy')
    expect(img.alt).toBe(JACK_ALT['well-done'])
    expect(img.getAttribute('src')).toBe(jackSrc('well-done', 384))
    rerender(<JackArt name="well-done" decorative />)
    expect(container.querySelector('img')!.alt).toBe('')
  })
})
