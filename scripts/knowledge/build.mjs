// Build the seed block of supabase/migrations/0025_knowledge.sql from scripts/knowledge/topics.json (the reviewed file).
//   node scripts/knowledge/build.mjs           rewrite the block between the BEGIN/END GENERATED SEED markers
//   node scripts/knowledge/build.mjs --check   exit 1 if the migration is not what topics.json produces (or the JSON is invalid)
// Offline, no network. Each topic is a short summary in our own words that points at a public source (see docs/SOURCES.md for licences).
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const BEGIN = '-- BEGIN GENERATED SEED (scripts/knowledge/build.mjs)'
export const END = '-- END GENERATED SEED'
export const HOSTS = ['medlineplus.gov', 'www.nhs.uk', 'www.who.int', 'doh.gov.ph', 'calabarzon.dilg.gov.ph']

/** Problems with the reviewed file, as a list of plain sentences (empty = valid). Mirrors the table checks in the migration. */
export function validate(topics) {
  const bad = []
  if (!Array.isArray(topics) || topics.length === 0) return ['topics.json must be a non-empty array']
  const slugs = new Set()
  for (const t of topics) {
    const id = t?.slug ?? '(no slug)'
    if (typeof t?.slug !== 'string' || !/^[a-z0-9-]{2,60}$/.test(t.slug)) bad.push(`${id}: slug must be 2-60 of a-z 0-9 -`)
    if (slugs.has(t.slug)) bad.push(`${id}: duplicate slug`)
    slugs.add(t.slug)
    for (const f of ['title_en', 'title_tl']) if (typeof t[f] !== 'string' || t[f].length < 1 || t[f].length > 120) bad.push(`${id}: ${f} must be 1-120 characters`)
    if (typeof t.summary !== 'string' || t.summary.length < 40 || t.summary.length > 700) bad.push(`${id}: summary must be 40-700 characters`)
    if (typeof t.source_name !== 'string' || t.source_name.length < 2 || t.source_name.length > 40) bad.push(`${id}: source_name must be 2-40 characters`)
    let host = null
    try { const u = new URL(t.source_url); if (u.protocol === 'https:') host = u.hostname } catch { /* reported below */ }
    if (!host || !HOSTS.includes(host)) bad.push(`${id}: source_url must be https on ${HOSTS.join(', ')}`)
    if (typeof t.reviewed_at !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(t.reviewed_at) || Number.isNaN(Date.parse(t.reviewed_at))) bad.push(`${id}: reviewed_at must be YYYY-MM-DD`)
    if (!Array.isArray(t.synonyms) || t.synonyms.length === 0) bad.push(`${id}: needs at least one synonym`)
    else for (const s of t.synonyms) if (typeof s !== 'string' || s !== s.toLowerCase() || !/^[a-z0-9][a-z0-9 '-]{0,59}$/.test(s)) bad.push(`${id}: synonym "${s}" must be lower case a-z 0-9 space ' - (max 60)`)
  }
  return bad
}

const q = (s) => `'${String(s).replace(/'/g, "''")}'`

/** The generated SQL (no markers): an upsert of every topic, then the synonym table rebuilt from the file. */
export function seedSql(topics) {
  const rows = topics.map((t) => `  (${[t.slug, t.title_en, t.title_tl, t.summary, t.source_name, t.source_url].map(q).join(', ')}, date ${q(t.reviewed_at)})`).join(',\n')
  const pairs = [...new Set(topics.flatMap((t) => t.synonyms.map((s) => `  (${q(s)}, ${q(t.slug)})`)))].join(',\n')
  return `insert into public.knowledge_topics (slug, title_en, title_tl, summary, source_name, source_url, reviewed_at) values
${rows}
on conflict (slug) do update set title_en = excluded.title_en, title_tl = excluded.title_tl, summary = excluded.summary,
  source_name = excluded.source_name, source_url = excluded.source_url, reviewed_at = excluded.reviewed_at;
delete from public.knowledge_topics where slug <> all (array[${topics.map((t) => q(t.slug)).join(', ')}]);
delete from public.knowledge_synonyms;
insert into public.knowledge_synonyms (term, topic_slug) values
${pairs};`
}

/** Replace the text between the markers of `migration` with `seed`. Throws if a marker is missing. */
export function spliceSeed(migration, seed) {
  const a = migration.indexOf(BEGIN)
  const b = migration.indexOf(END)
  if (a < 0 || b < a) throw new Error('0025_knowledge.sql lost its BEGIN/END GENERATED SEED markers')
  return migration.slice(0, a + BEGIN.length) + '\n' + seed + '\n' + migration.slice(b)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const here = dirname(fileURLToPath(import.meta.url))
  const migPath = join(here, '..', '..', 'supabase', 'migrations', '0025_knowledge.sql')
  const topics = JSON.parse(readFileSync(join(here, 'topics.json'), 'utf8'))
  const bad = validate(topics)
  if (bad.length) { console.error(bad.join('\n')); process.exit(1) }
  const current = readFileSync(migPath, 'utf8')
  const next = spliceSeed(current, seedSql(topics))
  if (process.argv[2] === '--check') {
    if (next !== current) { console.error('0025_knowledge.sql is out of date: run node scripts/knowledge/build.mjs'); process.exit(1) }
    console.log(`OK ${topics.length} topics`)
  } else {
    writeFileSync(migPath, next)
    console.log(`wrote ${topics.length} topics to supabase/migrations/0025_knowledge.sql`)
  }
}
