/** Display helpers for lab results: sensible number rounding and readable test and provider names. Pure, no imports. */

/** Max 2 decimals for normal numbers, 2 significant digits for values under 1 (0.72 stays 0.72, 0.004 stays 0.004); integers stay integers. Unknown is '' never 0. */
export function formatNumber(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return ''
  if (Number.isInteger(value)) return String(value)
  const a = Math.abs(value)
  return String(Number(a >= 1 ? value.toFixed(2) : value.toPrecision(2)))
}

/** "56.07 mg/dL"; the unit is left off when there is none. */
export function formatLabValue(value: number | null | undefined, unit?: string | null): string {
  const n = formatNumber(value)
  return n && unit?.trim() ? `${n} ${unit.trim()}` : n
}

// Words that stay in capitals (or a fixed mixed case) wherever they appear in a test name.
const FIXED: Record<string, string> = {
  alt: 'ALT', ast: 'AST', alp: 'ALP', ggt: 'GGT', hdl: 'HDL', ldl: 'LDL', vldl: 'VLDL', rbc: 'RBC', wbc: 'WBC', tsh: 'TSH', fbs: 'FBS', rbs: 'RBS',
  bun: 'BUN', mcv: 'MCV', mch: 'MCH', mchc: 'MCHC', rdw: 'RDW', mpv: 'MPV', inr: 'INR', crp: 'CRP', esr: 'ESR', psa: 'PSA', hgb: 'Hgb', hct: 'Hct',
  bmi: 'BMI', sgpt: 'SGPT', sgot: 'SGOT', egfr: 'eGFR', hba1c: 'HbA1c', ft3: 'FT3', ft4: 'FT4', t3: 'T3', t4: 'T4', bp: 'BP', ecg: 'ECG', ua: 'UA',
  cbc: 'CBC', ldh: 'LDH', ck: 'CK', mb: 'MB', hiv: 'HIV', hbsag: 'HBsAg', dna: 'DNA', rna: 'RNA', mri: 'MRI', ct: 'CT', ii: 'II', iii: 'III'
}
const SMALL = new Set(['of', 'and', 'to', 'in', 'for', 'per'])

const titleWord = (w: string, first: boolean) => {
  const k = w.toLowerCase()
  return FIXED[k] ?? (!first && SMALL.has(k) ? k : k.charAt(0).toUpperCase() + k.slice(1))
}

/** "alt" -> "ALT", "total_cholesterol" -> "Total Cholesterol", "egfr" -> "eGFR". Words are matched case-blind, so "Hdl" and "HDL" both give "HDL". */
export function labName(code: string | null | undefined): string {
  const s = (code ?? '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim()
  let i = 0
  return s.replace(/[A-Za-z0-9]+/g, (w) => titleWord(w, i++ === 0))
}

const KEEP = new Set(['md', 'rhu', 'er', 'icu', 'ii', 'iii', 'iv', 'ob', 'gyn', 'ent'])
/** Providers and facilities often arrive in ALL CAPS: make those Title Case. Text that already has lower case is left alone. */
export function providerName(s: string | null | undefined): string {
  const t = (s ?? '').trim()
  if (!t || /[a-z]/.test(t)) return t
  return t.toLowerCase().replace(/[a-z0-9]+/g, (w) => (KEEP.has(w) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
}
