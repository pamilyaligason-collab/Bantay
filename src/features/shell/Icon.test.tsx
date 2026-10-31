import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { Icon, ICON_SIZES, strokeFor, type IconName } from './Icon'
import { IconKidney, IconStomach, IconQuake, IconTyphoon } from './icons/custom'
import src from './Icon.tsx?raw'

const names = [...src.slice(src.indexOf('const ICONS')).split('} satisfies')[0].matchAll(/(\w+): Icon[A-Z]/g)].map((m) => m[1]) as IconName[]
const sw = (c: HTMLElement) => c.querySelector('svg')!.getAttribute('stroke-width')

describe('Icon', () => {
  it('derives the stroke from the size', () => {
    for (const [s, w] of [[16, 2.1], [20, 1.9], [24, 1.75], [32, 1.5], [48, 1.5], [12, 2.1]]) expect(strokeFor(s)).toBe(w)
    expect(sw(render(<Icon name="home" />).container)).toBe('1.75') // default size 24
    expect(render(<Icon name="home" />).container.querySelector('svg')!.getAttribute('width')).toBe('24')
    expect(sw(render(<Icon name="home" size={32} />).container)).toBe('1.5')
    expect(sw(render(<Icon name="home" size={20} stroke={2.5} />).container)).toBe('2.5')
    expect([...ICON_SIZES]).toEqual([16, 20, 24, 32])
  })
  it('boxed is a 40 px chip holding a 20 px glyph, whatever size is passed', () => {
    const { container } = render(<Icon name="pill" size={24} tone="medicine" boxed />)
    const box = container.querySelector('span.sh-icbox.sh-t-medicine') as HTMLElement
    expect(box.style.width).toBe('40px')
    expect(box.style.height).toBe('40px')
    expect(box.querySelector('svg')!.getAttribute('width')).toBe('20')
    expect(box.querySelector('svg')!.getAttribute('stroke-width')).toBe('1.9')
    expect(render(<Icon name="pill" boxed />).container.querySelector('.sh-t-neutral')).toBeTruthy()
  })
  it('active swaps to the filled twin or thickens the stroke', () => {
    expect(render(<Icon name="home" active />).container.querySelector('svg')!.classList.contains('sh-ic-f')).toBe(true)
    const c = render(<Icon name="walk" active />).container
    expect(sw(c)).toBe('1.95')
    expect(c.querySelector('svg')!.classList.contains('sh-ic-f')).toBe(false)
  })
  it('a listening mic and a play button never get a filled twin (D-103 rule 4)', () => {
    for (const n of ['mic', 'play'] as const) expect(render(<Icon name={n} active />).container.querySelector('svg')!.classList.contains('sh-ic-f'), n).toBe(false)
  })
  it('has the language icon (F9)', () => { expect(names).toContain('language') })
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
