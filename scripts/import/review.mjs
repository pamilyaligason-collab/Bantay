// Build import/<person>/review.html from extracted JSON. Open locally only.
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { reviewHtml } from './lib.mjs'

for (const person of readdirSync('import').filter((d) => statSync(`import/${d}`).isDirectory())) {
  const items = readdirSync(`import/${person}`)
    .filter((f) => f.endsWith('.json') && f !== 'confirmed.json')
    .map((f) => JSON.parse(readFileSync(`import/${person}/${f}`, 'utf8')))
  writeFileSync(`import/${person}/review.html`, reviewHtml(person, items))
  console.log(`${person}: ${items.length} files`)
}
