import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
it('own-header routes pad the scroller by the status bar inset', () => {
  expect(readFileSync('src/styles/safearea.css', 'utf8')).toMatch(/\.bt:not\(:has\(\.sh-top\)\) > \.scroll \{ padding-top: calc\(10px \+ var\(--sat\)\); \}/)
  expect(readFileSync('src/main.tsx', 'utf8')).toMatch(/import '\.\/styles\/safearea\.css'/)
})
