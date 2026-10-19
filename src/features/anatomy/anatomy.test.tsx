import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { afterEach, describe, expect, it } from 'vitest'
import content from './content.json'
import ExploreScreen from './ExploreScreen'
import { HITS, OWN_BODY, VIEW } from './shapes'

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
      expect(HITS[p.id]?.length, `${p.id} hits`).toBeGreaterThan(0)
    }
    expect(Object.keys(HITS).sort()).toEqual([...ids].sort())
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

describe('anatomy art', () => {
  const sprite = readFileSync('public/anatomy/body.svg', 'utf8')
  const assets = readFileSync('docs/ASSETS.md', 'utf8')

  it('has a body outline and one layer per system, small, with no text or script', () => {
    for (const id of ['body', ...content.systems.map((s) => s.id)]) expect(sprite, id).toContain(`<g id="${id}">`)
    expect(sprite).not.toMatch(/<(text|script|image|foreignObject)\b/)
    expect(gzipSync(sprite).length).toBeLessThan(150_000)
  })

  it('draws every tap spot inside its system window, with room for a 44px target', () => {
    for (const s of content.systems) {
      const [vx, vy, vw, vh] = VIEW[s.id]!
      const spots: [string, number, number][] = []
      for (const p of content.parts.filter((q) => q.system === s.id)) for (const [x, y] of HITS[p.id]!) {
        expect(x >= vx && x <= vx + vw && y >= vy && y <= vy + vh, `${p.id} ${x},${y} inside ${s.id}`).toBe(true)
        spots.push([p.id, x, y])
      }
      // Tap spots of different parts stay 22 frame units apart (about 35px at the smallest figure), so the 44px targets barely overlap.
      for (const a of spots) for (const b of spots) if (a[0] < b[0]) expect(Math.hypot(a[1] - b[1], a[2] - b[2]), `${a[0]} vs ${b[0]}`).toBeGreaterThanOrEqual(22)
    }
    expect(OWN_BODY.has('skeleton')).toBe(true)
  })

  it('records the licence of every source in docs/ASSETS.md and credits the art on screen', () => {
    expect(assets).toContain('public/anatomy/body.svg')
    for (const f of ['Circulatory_System_no_tags.svg', 'Human_skeleton_front_no-text_no-color.svg', 'Digestive_system_diagram_edit.svg', 'Respiratory_system_complete_gl.svg', 'Illu_urinary_system.svg', 'Brain_diagram_without_text.svg', 'Skin.svg', 'Endocrine_central_nervous_en.svg', 'Human_muscle_system_simple_diagram_unlabeled.jpg']) expect(assets, f).toContain(f)
    render(<ExploreScreen />)
    expect(screen.getByText(/^Illustrations: /)).toBeTruthy()
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
