// Builds src/data/medlib/topics.json (the offline Health library) from scripts/medlib/curated/*.txt
// plus the MedlinePlus health topics XML (https://medlineplus.gov/xml.html, public domain, U.S. National Library of Medicine).
//
//   node scripts/medlib/build.mjs                 download the newest XML, write topics.json
//   node scripts/medlib/build.mjs --xml <file>    use an XML you already have
//   node scripts/medlib/build.mjs --check-videos  also check every video id against YouTube oEmbed (network)
//
// The texts (short, goNow, sections) are written by hand in plain words; the XML only supplies the official
// MedlinePlus page and Tagalog handout links and proves each topic still exists. Nothing is copied from the XML summaries.
// Curated line format (one topic per "= id | Title | body | flags" block, see 01-heart.txt):
//   mp: / aka: / wiki: / s: (x3) / g: (goNow) / what: signs: home: prev: (items split by " ; ") / v: id | title | source / pic: file | credit | licence | href
// flags: ph = common in the Philippines; rainy or dry = season.
import { readFileSync, readdirSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..', '..')
const BODIES = ['heart', 'lungs', 'infections', 'sugar', 'kidneys', 'mind', 'bones', 'children', 'firstaid']
const argv = process.argv.slice(2)
const arg = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null }

async function getXml() {
  const given = arg('--xml')
  if (given) return { text: readFileSync(given, 'utf8'), date: /mplus_topics_(\d{4}-\d{2}-\d{2})/.exec(given)?.[1] ?? 'local' }
  const page = await (await fetch('https://medlineplus.gov/xml.html')).text()
  const dates = [...page.matchAll(/mplus_topics_(\d{4}-\d{2}-\d{2})\.xml/g)].map((m) => m[1]).sort()
  const date = dates.at(-1)
  if (!date) throw new Error('no mplus_topics_YYYY-MM-DD.xml link on xml.html')
  const file = join(tmpdir(), `mplus_topics_${date}.xml`)
  if (!existsSync(file)) {
    const res = await fetch(`https://medlineplus.gov/xml/mplus_topics_${date}.xml`)
    if (!res.ok) throw new Error(`xml download ${res.status}`)
    writeFileSync(file, Buffer.from(await res.arrayBuffer()))
  }
  return { text: readFileSync(file, 'utf8'), date }
}

const unesc = (s) => s.replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')

function indexXml(text) {
  const out = new Map()
  for (const chunk of text.split('<health-topic ').slice(1)) {
    const head = chunk.slice(0, chunk.indexOf('>'))
    if (!/language="English"/.test(head)) continue
    const title = unesc(/ title="([^"]*)"/.exec(head)?.[1] ?? '')
    const url = /\surl="([^"]*)"/.exec(head)?.[1]
    const tagalog = /url="([^"]*)">Tagalog</.exec(chunk)?.[1] ?? null
    if (title && url) out.set(title.toLowerCase(), { title, url, tagalog })
  }
  return out
}

function parseCurated() {
  const dir = join(here, 'curated')
  const topics = []
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.txt')).sort()) {
    let t = null
    readFileSync(join(dir, f), 'utf8').split(/\r?\n/).forEach((line, n) => {
      const where = `${f}:${n + 1}`
      if (!line.trim()) return
      if (line.startsWith('= ')) {
        const [id, title, body, flags = ''] = line.slice(2).split('|').map((x) => x.trim())
        const fl = flags.split(/\s+/).filter(Boolean)
        t = { where, id, title, mp: title, aka: [], body, ph: fl.includes('ph'), season: fl.includes('rainy') ? 'rainy' : fl.includes('dry') ? 'dry' : null, short: [], goNow: [], sec: {}, videos: [], wiki: null, picture: null }
        topics.push(t)
        return
      }
      if (!t) throw new Error(`${where}: line before the first "= " header`)
      const i = line.indexOf(':')
      const k = line.slice(0, i).trim()
      const v = line.slice(i + 1).trim()
      const items = () => v.split(' ; ').map((x) => x.trim()).filter(Boolean)
      if (k === 'mp') t.mp = v
      else if (k === 'aka') t.aka = v.split(',').map((x) => x.trim()).filter(Boolean)
      else if (k === 'wiki') t.wiki = v
      else if (k === 's') t.short.push(v)
      else if (k === 'g') t.goNow.push(v)
      else if (k === 'what') t.sec.what = v
      else if (k === 'signs' || k === 'home' || k === 'prev') t.sec[k] = items().join('\n')
      else if (k === 'v') { const [id, title, source] = v.split('|').map((x) => x.trim()); t.videos.push({ id, title, source }) }
      else if (k === 'pic') { const [file, credit, licence, href] = v.split('|').map((x) => x.trim()); t.picture = { file, credit, licence, href } }
      else throw new Error(`${where}: unknown field "${k}"`)
    })
  }
  return topics
}

const problems = []
const bad = (t, msg) => problems.push(`${t.where} ${t.id}: ${msg}`)

async function checkVideos(topics) {
  const seen = new Map()
  for (const t of topics) for (const v of t.videos) if (!seen.has(v.id)) seen.set(v.id, v)
  for (const v of seen.values()) {
    const res = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${v.id}`)}&format=json`)
    const j = res.ok ? await res.json() : null
    console.log(`${res.status} ${v.id} ${j?.author_name ?? ''}`)
    if (!res.ok) problems.push(`video ${v.id}: oEmbed ${res.status}`)
  }
}

const { text, date } = await getXml()
const xml = indexXml(text)
const cur = parseCurated()
const ids = new Set()
const topics = cur.map((t) => {
  if (ids.has(t.id)) bad(t, 'duplicate id')
  ids.add(t.id)
  if (!BODIES.includes(t.body)) bad(t, `body "${t.body}"`)
  if (t.short.length !== 3) bad(t, `needs 3 short lines, has ${t.short.length}`)
  if (t.goNow.length < 1) bad(t, 'needs at least one goNow line')
  if (t.aka.length < 1) bad(t, 'needs aka words')
  for (const k of ['what', 'signs', 'home', 'prev']) if (!t.sec[k]) bad(t, `missing ${k}`)
  if (t.videos.length > 2) bad(t, 'more than 2 videos')
  if (t.picture && !existsSync(join(root, 'public', 'img', 'medlib', t.picture.file))) bad(t, `picture ${t.picture.file} missing`)
  const m = xml.get(t.mp.toLowerCase())
  if (!m) { bad(t, `MedlinePlus has no topic titled "${t.mp}"`); return null }
  const links = { medlineplus: m.url }
  if (t.wiki) links.wikipedia = `https://en.wikipedia.org/wiki/${t.wiki}`
  if (m.tagalog) links.tagalog = m.tagalog
  const sections = [['What it is', 'what'], ['Signs', 'signs'], ['What helps at home', 'home'], ['Prevent it', 'prev']].map(([heading, k]) => ({ heading, text: t.sec[k] }))
  const o = { id: t.id, title: t.title, aka: t.aka, body: t.body }
  if (t.ph) o.ph = true
  o.season = t.season
  Object.assign(o, { short: t.short, goNow: t.goNow, sections, videos: t.videos, links })
  if (t.picture) o.picture = t.picture
  return o
})
if (argv.includes('--check-videos')) await checkVideos(cur)
if (problems.length) { console.error(problems.join('\n')); process.exit(1) }

const out = { version: date, source: 'MedlinePlus.gov, U.S. National Library of Medicine, rewritten in plain words', topics }
mkdirSync(join(root, 'src', 'data', 'medlib'), { recursive: true })
writeFileSync(join(root, 'src', 'data', 'medlib', 'topics.json'), '{\n"version":' + JSON.stringify(out.version) + ',\n"source":' + JSON.stringify(out.source) + ',\n"topics":[\n' + topics.map((t) => JSON.stringify(t)).join(',\n') + '\n]}\n')
console.log(`wrote ${topics.length} topics (MedlinePlus ${date})`)
