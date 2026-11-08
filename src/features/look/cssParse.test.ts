import postcss from 'postcss'
import { describe, expect, it } from 'vitest'

// S25 fix round: a hand edit of today.css once merged a selector into an @media and left a brace open, and the browser dropped ~620 lines. Every stylesheet must parse and balance.
const files = import.meta.glob('/src/**/*.css', { query: '?raw', import: 'default', eager: true }) as Record<string, string>

describe('every stylesheet parses', () => {
  it('finds the stylesheets', () => expect(Object.keys(files).length).toBeGreaterThan(10))
  for (const [path, css] of Object.entries(files)) {
    it(path, () => {
      const noComments = css.replace(/\/\*[\s\S]*?\*\//g, '')
      expect(noComments.split('{').length, 'braces balance').toBe(noComments.split('}').length)
      const root = postcss.parse(css) // throws on an unclosed block or a stray }
      root.walkRules((r) => expect(r.selector, `selector of a rule at line ${r.source?.start?.line}`).not.toMatch(/@|\/\*/))
    })
  }
})
