// Shared helpers for the historical-records import. No file contents are read here.
export const SKIP_RE = /birth|baptismal|^- ?hmo|ids and documents|insurance|home lot|visa/i
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
export async function walk(list, rootId, people) {
  const rows = []
  const visit = async (id, segments, person) => {
    for (const it of await list(id)) {
      const segs = [...segments, it.name]
      if (isSkipped(segs)) continue
      if (it.mime === 'application/vnd.google-apps.folder') {
        await visit(it.id, segs, person ?? people.find((p) => it.name.trim() === p) ?? it.name.trim())
      } else if (!it.name.startsWith('.')) {
        rows.push({
          person: person ?? '',
          date: [...segs].reverse().map(dateFrom).find(Boolean) || '',
          type: classifyType(segs.slice(1).join(' / ')),
          file_id: it.id,
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
  'Read this medical document. Return only JSON: {"tests":[{"name","value","unit","lab_range_low","lab_range_high","lab_range_text"}],' +
  '"consult":{"doctor","reason","medicines":[],"next_visit"},"confidence":0..1}. Use null for anything not printed. Copy values exactly; do not interpret them.'

/** Strip paid-model URL details and never echo the request body (it holds the document). */
export async function sendToOpenRouter(fetchImpl, body, key, log = console.error) {
  const r = await fetchImpl('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  if (!r.ok) {
    log(`OpenRouter failed: ${r.status}`)
    throw new Error(`OpenRouter failed: ${r.status}`)
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
export function buildRequest({ model, fallbackModel, mime, base64, filename = 'document' }) {
  for (const m of [model, fallbackModel]) if (!m || /:free$/i.test(m)) throw new Error('A paid model is required (no :free tier)')
  const part =
    mime === 'application/pdf'
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

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

/** One review table for one person. items: [{source_file_id, date, tests:[...], consult}] */
export function reviewHtml(person, items) {
  const rows = []
  for (const it of items) {
    for (const t of it.tests ?? []) rows.push({ kind: 'test', file: it.source_file_id, date: it.date ?? '', ...t })
    if (it.consult) rows.push({ kind: 'consult', file: it.source_file_id, date: it.date ?? '', ...it.consult })
  }
  const tr = rows
    .map(
      (r, i) =>
        `<tr data-i="${i}"><td>${esc(r.date)}</td><td>${esc(r.kind === 'test' ? r.name : 'Consult: ' + (r.doctor ?? ''))}</td>` +
        `<td>${esc(r.kind === 'test' ? `${r.value ?? ''} ${r.unit ?? ''}` : r.reason)}</td>` +
        `<td>${esc(r.kind === 'test' ? (r.lab_range_text ?? [r.lab_range_low, r.lab_range_high].join(' to ')) : (r.medicines ?? []).join(', '))}</td>` +
        `<td><button data-s="confirm">Confirm</button> <button data-s="reject">Reject</button></td></tr>`
    )
    .join('')
  return `<!doctype html><meta charset="utf-8"><title>Review ${esc(person)}</title>
<style>body{font:15px system-ui;margin:16px}td,th{border-bottom:1px solid #ccc;padding:6px;text-align:left}tr.confirm{background:#e6f4ea}tr.reject{background:#fde8e8}</style>
<h1>${esc(person)}</h1><p>Local only. Confirm each row against the original, then export.</p>
<table><thead><tr><th>Date</th><th>Item</th><th>Value</th><th>Lab range / medicines</th><th>Decision</th></tr></thead><tbody>${tr}</tbody></table>
<p><button id="x">Export confirmed.json</button></p>
<script>const rows=${JSON.stringify(rows).replaceAll('<', '\\u003c')};const st={};
document.querySelectorAll('button[data-s]').forEach(b=>b.onclick=()=>{const tr=b.closest('tr');st[tr.dataset.i]=b.dataset.s;tr.className=b.dataset.s});
document.getElementById('x').onclick=()=>{const out=rows.filter((_,i)=>st[i]==='confirm');
const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(out,null,2)],{type:'application/json'}));a.download='confirmed.json';a.click()}</script>`
}
