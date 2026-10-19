// Family people for the records import (D-68): alias config, person matching, confidence gate, profile merge,
// people-map and dependents SQL. Pure helpers plus a small CLI. Names live only in git-ignored import/aliases.json
// (shape in scripts/import/aliases.example.json); no Drive ids anywhere. Prints counts, never names or values.
//
// CLI:  node scripts/import/family.mjs people-map --from <json from "select id, display_name from public.people">
//       node scripts/import/family.mjs dependents            -> .scratch/add-dependents.sql
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { buildPeopleIndex, nameKey, sortedKey } from './normalize.mjs'

/** Must equal public.records_auto_threshold() in 0013. A lower value would be refused by the database trigger. */
export const AUTO_THRESHOLD = 0.9

/** "1. Name" folder numbering is not part of a name. */
export const stripNumber = (s) => String(s ?? '').replace(/^\s*\d+\s*[.)]\s*/, '')
const tokens = (s) => nameKey(stripNumber(s)).split(' ').filter((t) => t.length > 1) // initials never identify anyone

export function resolveThreshold(t = AUTO_THRESHOLD) {
  if (!(typeof t === 'number' && t >= AUTO_THRESHOLD && t <= 1)) throw new Error(`auto-confirm threshold must be between ${AUTO_THRESHOLD} and 1`)
  return t
}

// ---------- alias config ----------
/** cfg: {"people":[{"name":"...","aliases":["..."],"dependent":true}]}. Throws (without echoing values) on a bad shape. */
export function parseAliasConfig(cfg) {
  if (!cfg || !Array.isArray(cfg.people) || cfg.people.length === 0) throw new Error('aliases config needs a people list')
  const seen = new Map()
  const people = cfg.people.map((p, i) => {
    if (!p || typeof p.name !== 'string' || !p.name.trim()) throw new Error(`aliases config: person ${i + 1} has no name`)
    const aliases = (Array.isArray(p.aliases) ? p.aliases : []).filter((a) => typeof a === 'string' && a.trim()).map((a) => a.trim())
    const keys = [p.name.trim(), ...aliases]
    for (const k of keys) {
      const nk = sortedKey(stripNumber(k))
      if (seen.has(nk) && seen.get(nk) !== i) throw new Error(`aliases config: a name is listed for two people (person ${seen.get(nk) + 1} and ${i + 1})`)
      seen.set(nk, i)
    }
    return { name: p.name.trim(), aliases, dependent: p.dependent === true }
  })
  return { people }
}

/** Deep-scan any JSON for rows with id + display_name (the CLI's JSON shape is not fixed). */
export function extractPeopleRows(json) {
  const out = []
  const walk = (v) => {
    if (Array.isArray(v)) v.forEach(walk)
    else if (v && typeof v === 'object') {
      if (typeof v.id === 'string' && typeof v.display_name === 'string') out.push({ id: v.id, display_name: v.display_name })
      else Object.values(v).forEach(walk)
    }
  }
  walk(json)
  return out
}

/**
 * Config + database people -> people-map ({"<name or alias>": "<people.id>"}). A database person matches a config
 * person when its display name equals the name or any alias. Two matches either way are left out (ambiguous).
 */
export function buildPeopleMap(cfg, dbPeople) {
  const map = {}
  const missing = []
  let ambiguous = 0
  for (const p of cfg.people) {
    const keys = new Set([p.name, ...p.aliases].map((k) => sortedKey(stripNumber(k))))
    const hits = dbPeople.filter((d) => keys.has(sortedKey(d.display_name)))
    if (hits.length === 0) missing.push(p.name)
    else if (hits.length > 1) ambiguous++
    else for (const k of [p.name, ...p.aliases]) map[k] = hits[0].id.toLowerCase()
  }
  return { map, missing, ambiguous }
}

/** SQL that adds the config's dependents (no login) that the database does not have yet. Run by the orchestrator, after 0013. */
export function dependentsSql(cfg) {
  const q = (v) => `'${String(v).replaceAll('\0', '').replaceAll("'", "''")}'`
  const deps = cfg.people.filter((p) => p.dependent)
  if (deps.length === 0) return '-- no dependents in the config\n'
  const rows = deps.map((p) => `(${q(p.name)}, array[${[p.name, ...p.aliases].map((k) => q(nameKey(k))).join(', ')}]::text[], array[${p.aliases.map(q).join(', ')}]::text[])`)
  return [
    '-- Adds family members without a login as dependents of the first active admin (link_creator makes that admin their writer, D-14).',
    '-- Skips anyone whose display name already matches a name or alias. Safe to run twice. Needs 0013.',
    'begin;',
    'do $$',
    'declare admin_id uuid; v record; pid uuid;',
    'begin',
    "  select r.user_id into admin_id from public.app_roles r join public.people p on p.auth_user_id = r.user_id where r.role = 'admin' and not r.disabled order by r.created_at nulls last, r.user_id limit 1;",
    "  if admin_id is null then raise exception 'no active admin with a person row'; end if;",
    `  for v in select * from (values ${rows.join(', ')}) as t(name, keys, aliases) loop`,
    '    select p.id into pid from public.people p where lower(btrim(regexp_replace(p.display_name, \'[.,]\', \'\', \'g\'))) = any(v.keys) limit 1;',
    '    if pid is null then',
    '      insert into public.people (display_name, created_by) values (v.name, admin_id) returning id into pid;',
    '    end if;',
    '    update public.people set aliases = (select coalesce(array_agg(x), \'{}\') from (select distinct x from unnest(aliases || v.aliases) x limit 20) s) where id = pid;',
    '    insert into public.person_aliases (alias, person_id) select lower(btrim(a)), pid from unnest(array[v.name] || v.aliases) a on conflict (alias) do nothing;',
    '  end loop;',
    'end $$;',
    'commit;',
    ''
  ].join('\n')
}

// ---------- person matching ----------
/** peopleMap: {"<folder or printed name>": "<people.id>"} (names only). */
export function buildMatcher(peopleMap) {
  const idx = buildPeopleIndex(peopleMap)
  const multi = []
  for (const [k, id] of Object.entries(peopleMap ?? {})) {
    const t = tokens(k)
    if (t.length >= 2) multi.push({ t: new Set(t), id: id.toLowerCase() })
  }
  return { idx, multi }
}
const exact = (m, s) => {
  const k = stripNumber(s)
  return s ? m.idx.get(nameKey(k)) ?? m.idx.get(sortedKey(k)) ?? null : null
}
/** A printed name matches when it equals an alias, or contains every word of exactly one person's multi-word alias. */
export function printedHit(m, printed) {
  const e = exact(m, printed)
  if (e) return e
  const pt = new Set(tokens(printed ?? ''))
  if (pt.size === 0) return null
  const ids = new Set(m.multi.filter((a) => [...a.t].every((t) => pt.has(t))).map((a) => a.id))
  return ids.size === 1 ? [...ids][0] : null
}
/**
 * segments: the folder names above the file (not the file name).
 * strength: both (folder and printed name agree) | folder (printed name absent) | weak (printed name unrecognised) |
 *           printed (no folder match) | conflict | none. conflict and none give id null.
 */
export function matchPerson(m, { segments, printed }) {
  const folderIds = [...new Set(segments.map((s) => exact(m, s)).filter(Boolean))]
  const hasPrinted = typeof printed === 'string' && printed.trim() !== ''
  const ph = hasPrinted ? printedHit(m, printed) : null
  if (folderIds.length > 1) return { id: null, strength: 'conflict' }
  if (folderIds.length === 1) {
    if (ph && ph !== folderIds[0]) return { id: null, strength: 'conflict' }
    return { id: folderIds[0], strength: ph ? 'both' : hasPrinted ? 'weak' : 'folder' }
  }
  return ph ? { id: ph, strength: 'printed' } : { id: null, strength: 'none' }
}

/**
 * The auto-confirm decision. Confirmed needs a number confidence at or above the threshold AND a trustworthy person match:
 * folder and printed name agree; or, for health papers only, the folder matches and the paper prints no name.
 * Identity and insurance papers always print a name, so they need both. Everything else stays a draft.
 */
export function gate({ strength, confidence, lane = 'health', threshold = AUTO_THRESHOLD }) {
  if (typeof confidence !== 'number' || !Number.isFinite(confidence) || confidence < resolveThreshold(threshold)) return 'draft'
  if (strength === 'both') return 'confirmed'
  if (strength === 'folder' && lane === 'health') return 'confirmed'
  return 'draft'
}

// ---------- profile merge ----------
const BLOOD = /^(A|B|AB|O)[+-]$/
const str = (v) => (v == null || String(v).trim() === '' ? null : String(v).trim())
const isoDate = (v) => {
  const s = str(v)
  return s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) && new Date(s).toISOString().startsWith(s) ? s : null
}
/** Field normalisers: a value that does not parse is null (unknown), never guessed. */
export const PROFILE_FIELDS = {
  birthdate: isoDate,
  sex: (v) => (/^f/i.test(str(v) ?? '') ? 'female' : /^m/i.test(str(v) ?? '') ? 'male' : null),
  blood_type: (v) => {
    const s = str(v)?.toUpperCase().replace(/\s+/g, '').replace('POSITIVE', '+').replace('NEGATIVE', '-') ?? null
    return s && BLOOD.test(s) ? s : null
  },
  address: (v) => {
    const s = str(v)
    return s && s.length <= 300 ? s.replace(/\s+/g, ' ') : null
  }
}

/** cands: [{value, conf}] already normalised and already gated. Highest-confidence value wins; a tie between different values is a conflict (null). */
export function pickField(cands) {
  const groups = new Map()
  for (const c of cands) if (c.value != null) groups.set(c.value, Math.max(groups.get(c.value) ?? 0, c.conf))
  const ranked = [...groups.entries()].sort((a, b) => b[1] - a[1])
  if (ranked.length === 0) return null
  if (ranked.length > 1 && ranked[0][1] === ranked[1][1]) return null
  return ranked[0][0]
}

/** items: [{personId, fields:{birthdate,sex,blood_type,address}, conf}] from confirmed-grade identity drafts. -> Map personId -> {field: value} */
export function buildProfiles(items) {
  const by = new Map()
  for (const it of items) {
    const acc = by.get(it.personId) ?? Object.fromEntries(Object.keys(PROFILE_FIELDS).map((f) => [f, []]))
    for (const [f, norm] of Object.entries(PROFILE_FIELDS)) acc[f].push({ value: norm(it.fields?.[f]), conf: it.conf })
    by.set(it.personId, acc)
  }
  const out = new Map()
  for (const [pid, acc] of by) {
    const prof = {}
    for (const f of Object.keys(PROFILE_FIELDS)) {
      const v = pickField(acc[f])
      if (v != null) prof[f] = v
    }
    out.set(pid, prof)
  }
  return out
}

// ---------- CLI ----------
function main(argv = process.argv.slice(2)) {
  const [cmd] = argv
  const cfg = parseAliasConfig(JSON.parse(readFileSync('import/aliases.json', 'utf8')))
  if (cmd === 'people-map') {
    const from = argv[argv.indexOf('--from') + 1]
    if (!from || !existsSync(from)) throw new Error('people-map needs --from <json file>')
    const { map, missing, ambiguous } = buildPeopleMap(cfg, extractPeopleRows(JSON.parse(readFileSync(from, 'utf8'))))
    writeFileSync('import/people-map.json', JSON.stringify(map, null, 2))
    console.log(JSON.stringify({ config_people: cfg.people.length, mapped_people: cfg.people.length - missing.length - ambiguous, map_keys: Object.keys(map).length, missing: missing.length, ambiguous }))
  } else if (cmd === 'dependents') {
    mkdirSync('.scratch', { recursive: true })
    writeFileSync('.scratch/add-dependents.sql', dependentsSql(cfg))
    console.log(JSON.stringify({ dependents: cfg.people.filter((p) => p.dependent).length, file: '.scratch/add-dependents.sql' }))
  } else throw new Error('usage: family.mjs people-map --from <file> | dependents')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { main() } catch (e) { console.error(`family failed: ${e?.name ?? 'Error'}: ${e?.message?.slice(0, 120) ?? ''}`); process.exit(1) }
}
