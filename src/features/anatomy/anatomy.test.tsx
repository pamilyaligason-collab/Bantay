import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import content from './content.json'
import ExploreScreen from './ExploreScreen'
import { SHAPES } from './shapes'

afterEach(cleanup)

const sentences = (t: string) => t.split(/(?<=[.!?])\s+/).filter(Boolean).length

describe('anatomy content', () => {
  it('has the nine systems, each with at least two parts', () => {
    expect(content.systems.map((s) => s.label)).toEqual(['Skeleton', 'Muscles', 'Heart and blood', 'Lungs', 'Brain and nerves', 'Digestion', 'Kidneys and bladder', 'Skin', 'Hormones'])
    for (const s of content.systems) {
      expect(content.parts.filter((p) => p.system === s.id).length, s.id).toBeGreaterThanOrEqual(2)
      expect(s.url.startsWith('https://medlineplus.gov/'), s.id).toBe(true)
    }
  })

  it('every part is complete, plain, and drawn', () => {
    const ids = new Set<string>()
    for (const p of content.parts) {
      expect(ids.has(p.id), `dup ${p.id}`).toBe(false)
      ids.add(p.id)
      expect(content.systems.some((s) => s.id === p.system), p.id).toBe(true)
      expect(sentences(p.what), `${p.id} what`).toBeGreaterThanOrEqual(2)
      expect(sentences(p.what), `${p.id} what`).toBeLessThanOrEqual(3)
      for (const k of ['illnesses', 'warnings', 'prevention'] as const) expect(p[k].length, `${p.id} ${k}`).toBeGreaterThanOrEqual(2)
      expect(SHAPES[p.id], `${p.id} shape`).toBeTruthy()
      expect(SHAPES[p.id]!.hits.length, `${p.id} hits`).toBeGreaterThan(0)
    }
    expect(Object.keys(SHAPES).sort()).toEqual([...ids].sort())
  })

  it('has no em dashes and keeps the credit and disclaimer', () => {
    expect(JSON.stringify(content)).not.toMatch(/[—–]/)
    expect(content.source.name).toBe('MedlinePlus, National Library of Medicine')
    expect(content.disclaimer).toMatch(/^For learning, not a diagnosis/)
  })

  it('stays small', () => {
    expect(JSON.stringify(content).length).toBeLessThan(60_000)
  })
})

describe('Explore your body', () => {
  it('opens a sheet when a part on the body is tapped, and closes it', () => {
    render(<ExploreScreen />)
    fireEvent.click(screen.getByRole('button', { name: 'Heart and blood' }))
    fireEvent.click(document.querySelector('[data-part="heartorgan"]')!)
    const sheet = screen.getByRole('dialog', { name: 'Heart' })
    expect(within(sheet).getByText('What it does')).toBeTruthy()
    expect(within(sheet).getByText('Common illnesses in the Philippines')).toBeTruthy()
    expect(within(sheet).getByText('Get help right away if you notice')).toBeTruthy()
    expect(within(sheet).getByText('How to look after it')).toBeTruthy()
    const link = within(sheet).getByRole('link', { name: 'MedlinePlus, National Library of Medicine' })
    expect(link.getAttribute('href')).toMatch(/^https:\/\/medlineplus\.gov\//)
    fireEvent.keyDown(sheet, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('lists the parts of the chosen system and opens one from the list', () => {
    render(<ExploreScreen />)
    expect(screen.getAllByRole('button', { name: 'Skull' }).length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: 'Kidneys and bladder' }))
    expect(screen.queryByRole('button', { name: 'Skull' })).toBeNull()
    fireEvent.click(screen.getAllByRole('button', { name: 'Bladder' }).pop()!)
    expect(screen.getByRole('dialog', { name: 'Bladder' })).toBeTruthy()
  })

  it('shows the credits and disclaimer', () => {
    render(<ExploreScreen />)
    expect(screen.getAllByText(/For learning, not a diagnosis/).length).toBeGreaterThan(0)
    expect(screen.getByText(/MedlinePlus, National Library of Medicine\. All wording/)).toBeTruthy()
  })
})
