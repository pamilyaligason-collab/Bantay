import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { Icon, strokeFor, type IconName } from './Icon'
import { IconKidney, IconStomach, IconQuake, IconTyphoon } from './icons/custom'
import src from './Icon.tsx?raw'

const names = [...src.slice(src.indexOf('const ICONS')).split('} satisfies')[0].matchAll(/(\w+): Icon[A-Z]/g)].map((m) => m[1]) as IconName[]
const sw = (c: HTMLElement) => c.querySelector('svg')!.getAttribute('stroke-width')

describe('Icon', () => {
  it('derives the stroke from the size', () => {
    for (const [s, w] of [[16, 2.1], [20, 1.9], [22, 1.8], [26, 1.7], [32, 1.5], [48, 1.5]]) expect(strokeFor(s)).toBe(w)
    expect(strokeFor(24)).toBeGreaterThan(1.7)
    expect(strokeFor(24)).toBeLessThan(1.8)
    expect(sw(render(<Icon name="home" size={26} />).container)).toBe('1.7')
    expect(sw(render(<Icon name="home" size={26} stroke={2.5} />).container)).toBe('2.5')
  })
  it('boxed wraps the glyph in a tone box 1.75x the size', () => {
    const { container } = render(<Icon name="pill" size={20} tone="medicine" boxed />)
    const box = container.querySelector('span.sh-icbox.sh-t-medicine') as HTMLElement
    expect(box.style.width).toBe('35px')
    expect(box.querySelector('svg')).toBeTruthy()
    expect(render(<Icon name="pill" boxed />).container.querySelector('.sh-t-neutral')).toBeTruthy()
  })
  it('active swaps to the filled twin or thickens the stroke', () => {
    expect(render(<Icon name="home" active />).container.querySelector('svg')!.classList.contains('sh-ic-f')).toBe(true)
    const c = render(<Icon name="walk" active />).container
    expect(sw(c)).toBe('2')
    expect(c.querySelector('svg')!.classList.contains('sh-ic-f')).toBe(false)
  })
  it('label makes it an image, otherwise hidden', () => {
    const a = render(<Icon name="check" label="Done" />).container.querySelector('svg')!
    expect(a.getAttribute('role')).toBe('img')
    expect(a.getAttribute('aria-label')).toBe('Done')
    expect(a.hasAttribute('aria-hidden')).toBe(false)
    expect(render(<Icon name="check" />).container.querySelector('svg')!.getAttribute('aria-hidden')).toBe('true')
  })
  it('every name renders an svg', () => {
    expect(names.length).toBeGreaterThan(60)
    for (const n of ['kidney', 'stomach', 'quake', 'typhoon', 'flood']) expect(names).toContain(n)
    for (const n of names) expect(render(<Icon name={n} />).container.querySelector('svg path, svg circle'), n).toBeTruthy()
  })
  it('custom icons take the Tabler props', () => {
    for (const C of [IconKidney, IconStomach, IconQuake, IconTyphoon]) {
      const svg = render(<C size={30} stroke={1.5} className="x" aria-hidden="true" />).container.querySelector('svg')!
      expect(svg.getAttribute('width')).toBe('30')
      expect(svg.getAttribute('stroke-width')).toBe('1.5')
      expect(svg.getAttribute('viewBox')).toBe('0 0 24 24')
      expect(svg.getAttribute('class')).toBe('x')
      expect(svg.querySelectorAll('path').length).toBeGreaterThan(0)
    }
  })
})
