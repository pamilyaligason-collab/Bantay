import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import ReplyText from './ReplyText'

describe('ReplyText', () => {
  it('turns "- " lines into one list, **bold** into strong, and keeps the paragraphs around it', () => {
    const { container } = render(<ReplyText text={'Here are some ideas:\n- **Oatmeal** with banana\n- **Eggs** with tomatoes\nGo easy on salty food.'} />)
    expect(container.querySelectorAll('ul li')).toHaveLength(2)
    expect(container.querySelector('li strong')?.textContent).toBe('Oatmeal')
    expect([...container.querySelectorAll('p')].map((p) => p.textContent)).toEqual(['Here are some ideas:', 'Go easy on salty food.'])
    expect(container.textContent).not.toContain('**')
  })
  it('never renders HTML from the reply', () => {
    const { container } = render(<ReplyText text={'<img src=x onerror=alert(1)> **<b>hi</b>**'} />)
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('b')).toBeNull()
    expect(container.textContent).toContain('<img src=x onerror=alert(1)>')
  })
  it('drops a stray ** and a heading mark', () => {
    const { container } = render(<ReplyText text={'## Tips\nEat **less salt'} />)
    expect(container.textContent).toBe('TipsEat less salt')
  })
})
