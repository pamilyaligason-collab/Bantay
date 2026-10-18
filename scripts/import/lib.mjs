// Shared helpers for the historical-records import. No file contents are read here.
// Non-health files: never downloaded or parsed, only counted.
export const SKIP_RE =
  /birth|baptismal|^- ?hmo|ids and documents|insurance|home lot|visa|passport|\bland\b|\blot\b|\bfunds?\b|authori[sz]ation|\bids?\b|\.picasaoriginals/i
export const CSV_HEADER = 'person,date,type,file_id,mime,path'

export const isSkipped = (segments) => segments.some((s) => SKIP_RE.test(s.trim()))

/** Earliest keyword in the text wins, so "Ultrasound, Urinalysis" is ultrasound. */
export function classifyType(text) {
  const kinds = [
    ['laboratory', /laborator|\blab\b|\bbun\b|crea?tinine|createnine|lipid|cbc/i],
    ['consultation', /consult|prescription/i],
    ['ultrasound', /ultrasound/i],
    ['urinalysis', /urinalysis/i]
  ]
  let best = ['other', Infinity]
  for (const [k, re] of kinds) {
    const m = re.exec(text)
    if (m && m.index < best[1]) best = [k, m.index]
  }
  return best[0]
}

/** Full dates only (YYYY.MM.DD, YYYYMMDD, YYYY-MM-DD, _ separators). Month-only folders give ''. */
export function dateFrom(text) {
  const m = /(?<!\d)(20\d{2})[.\-_]?(0[1-9]|1[0-2])[.\-_]?(0[1-9]|[12]\d|3[01])(?!\d)/.exec(text)
  return m ? `${m[1]}-${m[2]}-${m[3]}` : ''
}

const q = (v) => (/[",\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v)
export const csvRow = (r) => [r.person, r.date, r.type, r.file_id, r.mime, r.path].map((v) => q(String(v ?? ''))).join(',')

/** list(folderId) returns child items {id,name,mime}. Returns inventory rows (files only). */
/** people: names of the top-level person folders (from the git-ignored import/people.json). */
export async function walk(list, rootId, people, onSkip = () => {}) {
  const rows = []
  const visit = async (id, segments, person) => {
    for (const it of await list(id)) {
      const segs = [...segments, it.name]
      if (isSkipped(segs)) {
        onSkip()
        continue
      }
      if (it.mime === 'application/vnd.google-apps.folder') {
        await visit(it.id, segs, person ?? people.find((p) => it.name.trim() === p) ?? it.name.trim())
      } else if (!it.name.startsWith('.')) {
        rows.push({
          person: person ?? '',
          date: [...segs].reverse().map(dateFrom).find(Boolean) || '',
          type: classifyType(segs.slice(1).join(' / ')),
          file_id: it.id,
          name: it.name,
          size: it.size ?? null,
          modified: it.modified ?? null,
          md5: it.md5 ?? null,
          mime: it.mime,
          path: segs.join('/')
        })
      }
    }
  }
  await visit(rootId, [], null)
  return rows
}

// ---- OpenRouter extraction ----
export const PROMPT =
  'Read this medical document. Return only JSON: {"doc_kind":"lab|prescription|lab_request|imaging|vaccination|insurance|certificate|other","doc_date","collected_at","released_at","facility","patient_name_as_printed",' +
  '"tests":[{"panel","name","value","unit","flag","ref_low","ref_high","ref_text"}],' +
  '"rx":{"date","prescriber","follow_up","lines":[{"line_no","drug","strength","form","dose","frequency","duration","quantity","instructions","unclear","bbox"}]},' +
  '"imaging":{"modality","body_region","findings","impression","measurements"},' +
  '"vaccinations":[{"vaccine","dose_no","given_on","facility","lot"}],"confidence":0..1}. ' +
  'Dates as YYYY-MM-DD, timestamps ISO 8601. Use null for anything not printed. Copy exactly as printed; never interpret, convert or correct. Set unclear true for handwriting you cannot read with confidence.'

/** Strip paid-model URL details and never echo the request body (it holds the document). */
export async function sendToOpenRouter(fetchImpl, body, key, log = console.error) {
  const r = await fetchImpl('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  if (!r.ok) {
    log(`OpenRouter failed: ${r.status}`)
    throw Object.assign(new Error(`OpenRouter failed: ${r.status}`), { status: r.status })
  }
  const c = (await r.json()).choices[0].message.content
  try { return JSON.parse(c) } catch { throw new Error('OpenRouter returned non-JSON') } // never echo model output (health values)
}

export function assertAllowed(argv, env) {
  if (!env.OPENROUTER_API_KEY) throw new Error('OPENROUTER_API_KEY is not set')
  if (!argv.includes('--i-am-lloyd')) throw new Error('Refusing to run without --i-am-lloyd')
  if (!env.OPENROUTER_MODEL) throw new Error('OPENROUTER_MODEL is not set')
}

/** Health data: zero data retention, no providers that collect data, never a free tier. */
export function buildRequest({ model, fallbackModel, mime, base64, filename = 'document', text }) {
  for (const m of [model, fallbackModel]) if (!m || /:free$/i.test(m)) throw new Error('A paid model is required (no :free tier)')
  const part =
    text != null
      ? { type: 'text', text: `Document text layer:\n${text}` }
      : mime === 'application/pdf'
      ? { type: 'file', file: { filename, file_data: `data:${mime};base64,${base64}` } }
      : { type: 'image_url', image_url: { url: `data:${mime};base64,${base64}` } }
  return {
    model,
    models: [model, fallbackModel],
    provider: { zdr: true, data_collection: 'deny' },
    response_format: { type: 'json_object' },
    messages: [{ role: 'user', content: [{ type: 'text', text: PROMPT }, part] }]
  }
}
