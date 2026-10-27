// Fails (exit 1) when Learn content carries a marker of text we may not use: ASHP / AHFS drug monographs, A.D.A.M. encyclopedia text, Lexicomp, Micromedex.
// Usage: node scripts/knowledge/learn-licence-check.mjs [dir ...]   (default: src/data/learn and src/features/discover/learn). Test files are skipped.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const MARKERS = [/\bASHP\b/i, /A\.D\.A\.M/i, /\bADAM,? Inc/i, /American Society of Health-System/i, /\bAHFS\b/i, /Lexicomp/i, /Micromedex/i, /Medical Encyclopedia/i]

/** The markers found in a piece of text (as source strings). */
export const findMarkers = (text) => MARKERS.filter((m) => m.test(text)).map((m) => m.source)

function* walk(dir) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) yield* walk(p)
    else if (!/\.test\.[tj]sx?$/.test(n)) yield p
  }
}

/** Every [file, marker] hit under the given directories. */
export function scan(dirs) {
  const hits = []
  for (const d of dirs) for (const f of walk(d)) for (const m of findMarkers(readFileSync(f, 'utf8'))) hits.push([f, m])
  return hits
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dirs = process.argv.length > 2 ? process.argv.slice(2) : ['src/data/learn', 'src/features/discover/learn']
  const hits = scan(dirs)
  for (const [f, m] of hits) console.error(`licence marker ${m} in ${f}`)
  console.log(hits.length ? `${hits.length} licence marker(s) found` : 'licence check: 0 markers')
  process.exit(hits.length ? 1 : 0)
}
