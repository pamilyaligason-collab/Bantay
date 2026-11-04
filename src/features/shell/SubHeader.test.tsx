import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { SubHeader } from './SubHeader'

afterEach(cleanup)
describe('SubHeader', () => {
  it('draws the v13 Back link with the parent name and the title as h1', () => {
    const { container } = render(<SubHeader title="Medicines" backHref="#health" backLabel="Back to Health" trailing={<button type="button">Add</button>} />)
    const back = container.querySelector('a.lt-back')!
    expect(back.getAttribute('href')).toBe('#health')
    expect(back.getAttribute('aria-label')).toBe('Back to Health')
    expect(back.textContent).toBe('Health')
    expect(container.querySelector('h1.lt-title')?.textContent).toBe('Medicines')
    expect(screen.getByRole('button', { name: 'Add' })).toBeTruthy()
    expect(container.querySelector('.sh-top, .sh-subhdr')).toBeNull()
  })
  it('a bare "Back" label does not become "Back to Back"', () => {
    const { container } = render(<SubHeader title="Scan" backHref="#family/papers" backLabel="Back" />)
    expect(container.querySelector('a.lt-back')?.getAttribute('aria-label')).toBe('Back')
  })
})
