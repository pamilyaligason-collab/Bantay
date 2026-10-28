import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// D-91: Jack Jack never appears on SOS, an incoming SOS, an emergency result or a high-reading/crisis card.
const SRC = join(__dirname, '..', '..')
const walk = (dir: string): string[] => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n)
  return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(n) && !/\.test\./.test(n) ? [p] : []
})
const GUARDED = [
  ...walk(join(SRC, 'features', 'sos')),
  join(SRC, 'features', 'family', 'IncomingSos.tsx'),
  join(SRC, 'features', 'assistant', 'EmergencyCard.tsx'),
  join(SRC, 'features', 'health', 'bpcheck', 'CrisisCard.tsx'),
]

describe('Jack Jack stays off emergencies (D-91)', () => {
  it('guards the SOS, incoming SOS, emergency and crisis files', () => {
    expect(GUARDED.length).toBeGreaterThanOrEqual(15) // the sos folder alone has 17 source files; a bad path would shrink this
  })

  it.each(GUARDED.map((p) => [p.slice(SRC.length + 1).replace(/\\/g, '/'), p]))('%s does not import or render Jack', (_name, path) => {
    const text = readFileSync(path!, 'utf8')
    expect(text).not.toMatch(/JackArt|assets\/jack|jackSrc|JACK_ALT/)
    // EmptyState draws Jack when it has no icon, so an EmptyState here must name its icon.
    for (const tag of text.match(/<EmptyState\b[^>]*>/g) ?? []) expect(tag).toMatch(/\bicon=/)
  })
})
