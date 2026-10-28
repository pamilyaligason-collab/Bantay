import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { JACK_ALT, JackArt, jackSrc, type JackName } from './JackArt'

describe('JackArt', () => {
  it('has a 256 and a 1024 file for every name, and the head has a 128', () => {
    for (const name of Object.keys(JACK_ALT) as JackName[]) {
      expect(jackSrc(name, 256), name).toBeTruthy()
      expect(jackSrc(name, 1024), name).toBeTruthy()
    }
    expect(jackSrc('head', 128)).toBeTruthy()
  })

  it('renders a fixed, lazy box with alt text, or an empty alt when decorative', () => {
    const { container, rerender } = render(<JackArt name="well-done" size={120} />)
    const img = container.querySelector('img')!
    expect(img.getAttribute('width')).toBe('120')
    expect(img.getAttribute('height')).toBe('120')
    expect(img.getAttribute('loading')).toBe('lazy')
    expect(img.alt).toBe(JACK_ALT['well-done'])
    rerender(<JackArt name="well-done" decorative />)
    expect(container.querySelector('img')!.alt).toBe('')
  })
})
