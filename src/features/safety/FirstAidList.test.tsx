import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
vi.mock('./FirstAid', async (orig) => { const o = await orig<typeof import('./FirstAid')>(); return { ...o, TOPICS: [...o.TOPICS].reverse() } }) // input order flipped, so the sort has real work to do
import FirstAidList, { boardTopics } from './FirstAidList'
import { FLAGS } from './flags'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { over, parse, ratio, tokensOf } from '../look/contrastMath'

afterEach(cleanup)

describe('FirstAidList', () => {
  it('lists all 17 topics, CPR hero first, Tagalog lines tagged', () => {
    render(<FirstAidList />)
    const list = screen.getByRole('list', { name: 'All 17 topics' })
    const links = within(list).getAllByRole('link')
    expect(links).toHaveLength(17)
    expect(screen.getAllByRole('link')[0]!.getAttribute('href')).toBe('tel:911')
    expect(screen.getAllByRole('link', { name: /CPR/ })[0]!.getAttribute('href')).toBe('#safety/firstaid/cpr')
    expect(links.every((a) => a.querySelector('[lang="fil"]') || a.textContent!.length > 0)).toBe(true)
    expect(document.querySelectorAll('[lang="fil"]').length).toBeGreaterThan(10)
  })
  it('shows no Saved chips or Offline section while the flag is off', () => {
    expect(FLAGS.firstAidOffline).toBe(false)
    render(<FirstAidList />)
    expect(screen.queryByText('Saved')).toBeNull()
    expect(screen.queryByText('Offline copies')).toBeNull()
    expect(screen.queryByText('Offline')).toBeNull()
  })
  it('lists the board order with the board tints, whatever order firstaid.json has (W10)', () => {
    render(<FirstAidList />)
    const links = within(screen.getByRole('list', { name: 'All 17 topics' })).getAllByRole('link')
    const ids = links.map((a) => a.getAttribute('href')!.replace('#safety/firstaid/', ''))
    expect(ids).toEqual(['stroke', 'dengue-warning-signs', 'cpr', 'choking', 'bleeding', 'heart-attack', 'burns', 'heat-stroke', 'seizure', 'fainting', 'fracture', 'drowning', 'snake-bite', 'dog-bite-rabies', 'low-sugar', 'allergic-reaction', 'falls'])
    const tint = (id: string) => links[ids.indexOf(id)]!.getAttribute('data-tint')
    expect([tint('stroke'), tint('dengue-warning-signs'), tint('choking'), tint('fainting'), tint('snake-bite'), tint('low-sugar')]).toEqual(['red', 'purple', 'amber', 'blue', 'green', 'teal'])
    expect(boardTopics().map((t) => t.id)).toEqual(ids)
  })
  it('the glyph is 3:1 on its box in every tint, light and dark (box = ink mixed into --card at the .sh-icbox --tint read from shell.css)', () => {
    const css = readFileSync(join(process.cwd(), 'src/features/shell/shell.css'), 'utf8')
    const light = /^\.sh-icbox \{ --tint: (\d+)%/m.exec(css)?.[1]
    const dark = /^:root\[data-theme="dark"\] \.sh-icbox \{ --tint: (\d+)%/m.exec(css)?.[1]
    expect([light, dark], 'shell.css .sh-icbox --tint rules moved: update this read').toEqual(['14', '22']) // pinned: a changed mix fails here, then re-check the 3:1 below
    const os = /@media \(prefers-color-scheme: dark\) \{ :root:not\(\[data-theme="light"\]\) \.sh-icbox \{ --tint: (\d+)%/.exec(css)?.[1] // the phone's own dark setting (no data-theme): it must mix the same as the dark theme rule above
    expect(os, 'shell.css prefers-color-scheme dark .sh-icbox rule moved or differs from the dark theme rule').toBe(dark)
    for (const [theme, mix] of [['light', Number(light) / 100], ['dark', Number(dark) / 100]] as const) {
      const t = tokensOf(theme)
      for (const tint of ['red', 'amber', 'purple', 'blue', 'green', 'teal']) {
        const ink = parse(t[`--tint-${tint}-ink`]!)[0]
        const box = over([ink, mix], parse(t['--card']!)[0])
        expect(ratio(ink, box), `${theme} ${tint}`).toBeGreaterThanOrEqual(3)
      }
    }
  })
})
