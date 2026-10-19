// Per-folder lane for the family folder (D-68). Pure: looks at path names only, never at file contents.
//   health        -> lab / prescription / imaging / vaccination extraction (health PROMPT)
//   identity      -> ID cards and civil documents: profile fields + ID numbers (identity PROMPT)
//   insurance     -> HMO / PhilHealth / insurance cards (identity PROMPT)
//   document_only -> visa, land, tax, funds: registered as a file for the person, never read or extracted
// Priority when several apply: document_only > insurance > identity > health. Folder names decide first;
// the file name only decides when no folder does ("Birth Cert - X.pdf" inside a person's lab folder).
export const LANES = ['health', 'identity', 'insurance', 'document_only']

const RULES = [
  ['document_only', /visa|home lot|\bland\b|\blot\b|property|\btax\b|\bfunds?\b|authori[sz]ation|flight/i],
  ['insurance', /insurance|\bhmo\b|phil ?health|maxicare|intellicare|medicard/i],
  ['identity', /\bids?\b|passport|birth|baptismal|marriage|\bcivil\b|national id|umid|driver|licen[sc]e/i]
]
const PICASA = /\.picasaoriginals/i

const laneOf = (texts) => {
  for (const [lane, re] of RULES) if (texts.some((t) => re.test(t))) return lane
  return null
}

/** @param {string[]} segments path from the sync root, file name last. @returns {{lane: string|null, skip: string|null}} */
export function classifyPath(segments) {
  const segs = segments.map((s) => String(s).trim())
  if (segs.some((s) => PICASA.test(s))) return { lane: null, skip: 'picasa' }
  const folders = segs.slice(0, -1)
  return { lane: laneOf(folders) ?? laneOf(segs.slice(-1)) ?? 'health', skip: null }
}

/** Only the identity lanes use the identity prompt; document_only is never sent anywhere. */
export const promptFor = (lane) => (lane === 'document_only' ? null : lane === 'identity' || lane === 'insurance' ? 'identity' : 'health')
