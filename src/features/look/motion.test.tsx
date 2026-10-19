// @vitest-environment jsdom
import { render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CountUp } from './CountUp'
import { wireMotion, springIn } from './motion'

const reduce = () => vi.stubGlobal('matchMedia', (q: string) => ({ matches: true, media: q, addEventListener() {}, removeEventListener() {} }))
afterEach(() => vi.unstubAllGlobals())

describe('reduced motion', () => {
  it('CountUp renders the final value', () => {
    reduce()
    const { container } = render(<CountUp to={1234} />)
    expect(container.textContent).toBe((1234).toLocaleString())
  })
  it('CountUp shows a dash for unknown, not 0', () => {
    reduce()
    expect(render(<CountUp to={null} />).container.textContent).toBe('–')
  })
  it('wireMotion changes nothing and observes nothing', () => {
    reduce()
    const io = vi.fn()
    vi.stubGlobal('IntersectionObserver', io)
    document.body.innerHTML = '<div id="r"><p data-reveal>a</p><b data-count="42">7</b></div>'
    wireMotion(document.getElementById('r'))()
    expect(io).not.toHaveBeenCalled()
    expect(document.querySelector('b')!.textContent).toBe('7')
  })
  it('springIn does not animate', () => {
    reduce()
    const el = document.createElement('div')
    const a = vi.fn()
    el.animate = a as never
    springIn(el, 1)
    expect(a).not.toHaveBeenCalled()
  })
})
