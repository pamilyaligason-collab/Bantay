import { describe, expect, it } from 'vitest'
import v13 from './v13.css?raw'
import { parse, ratio, tokensOf } from './contrastMath'

const TABS = ['today', 'health', 'discover', 'family', 'safety'] as const
const LIGHT = (tab: string) => new RegExp(`^\\.bt\\[data-tab="${tab}"\\] \\{([^}]*)\\}`, 'm')
const DARK = (tab: string) => new RegExp(`^:root\\[data-theme="dark"\\] \\.bt\\[data-tab="${tab}"\\] \\{([^}]*)\\}`, 'm')
const vars = (body: string) => Object.fromEntries([...body.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()]))

for (const theme of ['light', 'dark'] as const) {
  describe(`tab tokens ${theme}`, () => {
    const base = tokensOf(theme)
    for (const tab of TABS) {
      // dark overrides sit on top of the light block, as in the cascade
      const light = vars(v13.match(LIGHT(tab))![1]!)
      const own = theme === 'light' ? light : { ...light, ...vars(v13.match(DARK(tab))![1]!) }
      const t = { ...base, ...own }
      const accent = parse(t['--tab-accent']!)[0]
      it(`${tab}: --tab-accent on --tab-bg and --tab-bg2 >= 4.5`, () => {
        expect(ratio(accent, parse(t['--tab-bg']!)[0])).toBeGreaterThanOrEqual(4.5)
        expect(ratio(accent, parse(t['--tab-bg2']!)[0])).toBeGreaterThanOrEqual(4.5)
      })
      it(`${tab}: --tab-accent on --tab-accent-soft >= 4.5`, () => expect(ratio(accent, parse(t['--tab-accent-soft']!)[0])).toBeGreaterThanOrEqual(4.5))
      it(`${tab}: --ink and --muted on the ground >= 4.5`, () => {
        for (const bg of ['--tab-bg', '--tab-bg2']) for (const fg of ['--ink', '--muted']) expect(ratio(parse(t[fg]!)[0], parse(t[bg]!)[0]), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5)
      })
    }
  })
}
describe('tab tokens contract', () => {
  it('the dark media block repeats the data-theme dark values', () => {
    for (const tab of TABS) {
      const a = vars(v13.match(DARK(tab))![1]!)
      const m = v13.match(new RegExp(`:root:not\\(\\[data-theme="light"\\]\\) \\.bt\\[data-tab="${tab}"\\] \\{([^}]*)\\}`))![1]!
      expect(vars(m)).toEqual(a)
    }
  })
})
