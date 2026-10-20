import { formatNumber } from '../../lib/labFormat'
import { normaliseDrug } from '../health/meds'
import { metricLabel } from '../health/model'
import type { Reading } from '../health/ranges'
import type { Medication } from '../log/store'
import { systemOf } from './status'

/** The info panel under the system name on Explore your body: what it does, your numbers, medicines that act here, where to read more. */
export interface SystemInfo { what: [string, string]; metric: string | null; learn: string; learnKind: 'c' | 'm' }
export const SYSTEM_INFO: Record<string, SystemInfo> = {
  heart: { what: ['Your heart pumps blood through your vessels about 100,000 times a day.', 'High pressure makes it work harder and wears the vessel walls.'], metric: 'bp_systolic', learn: 'High blood pressure', learnKind: 'c' },
  lungs: { what: ['Your lungs take in oxygen and send out carbon dioxide with every breath.', 'Smoke, dust and infections make breathing harder.'], metric: null, learn: 'Asthma', learnKind: 'c' },
  brain: { what: ['Your brain and nerves control thinking, feeling, movement and sleep.', 'Poor sleep and stress show up here first.'], metric: 'sleep', learn: 'Stroke', learnKind: 'c' },
  digestion: { what: ['Your gut breaks food down into what the body can use.', 'Your liver cleans the blood and handles most medicines.'], metric: null, learn: 'Fatty liver disease', learnKind: 'c' },
  kidneys: { what: ['Your kidneys filter waste and extra water out of your blood.', 'High pressure and high sugar slowly harm them, often with no signs.'], metric: 'creatinine', learn: 'Chronic kidney disease', learnKind: 'c' },
  hormones: { what: ['Hormones are body messengers. Insulin moves sugar from your blood into your cells.', 'When it does not work well, sugar stays high.'], metric: 'fasting_glucose', learn: 'Type 2 diabetes', learnKind: 'c' },
  skeleton: { what: ['Your bones hold you up, protect your organs and store calcium.', 'They get thinner with age, so weight-bearing exercise helps.'], metric: null, learn: 'Osteoporosis', learnKind: 'c' },
  muscles: { what: ['Your muscles move you and keep your joints steady.', 'Walking a little every day keeps them strong.'], metric: 'steps', learn: 'Exercise and physical fitness', learnKind: 'c' },
  skin: { what: ['Your skin keeps germs out and keeps your temperature steady.', 'Check feet and any wound that heals slowly, especially with diabetes.'], metric: null, learn: 'Skin care', learnKind: 'c' }
}

/** A simple nudge, not medical advice: which body system a common medicine mostly works on, and in what words. Matched on the normalised name.
 *  Only for "what is this tablet for" curiosity; it never decides a dose or a warning. */
export const DRUG_NUDGE_NOTE = 'A simple guide, not medical advice. Ask your doctor or pharmacist what each medicine is for.'
const DRUG_SYSTEM: [string[], string, string][] = [
  [['amlodipine', 'nifedipine', 'felodipine'], 'heart', 'relaxes vessels'],
  [['losartan', 'valsartan', 'telmisartan', 'candesartan', 'irbesartan', 'olmesartan'], 'heart', 'relaxes vessels, lowers blood pressure'],
  [['lisinopril', 'enalapril', 'captopril', 'perindopril', 'ramipril'], 'heart', 'relaxes vessels, lowers blood pressure'],
  [['atenolol', 'metoprolol', 'bisoprolol', 'carvedilol'], 'heart', 'slows the heart, lowers blood pressure'],
  [['hydrochlorothiazide', 'indapamide', 'furosemide'], 'kidneys', 'removes extra water and salt'],
  [['atorvastatin', 'simvastatin', 'rosuvastatin', 'pravastatin'], 'heart', 'lowers LDL cholesterol'],
  [['aspirin', 'clopidogrel'], 'heart', 'helps stop clots'],
  [['metformin', 'gliclazide', 'glimepiride', 'sitagliptin', 'vildagliptin', 'linagliptin', 'empagliflozin', 'dapagliflozin', 'insulin'], 'hormones', 'lowers blood sugar'],
  [['levothyroxine'], 'hormones', 'replaces thyroid hormone'],
  [['salbutamol', 'budesonide', 'montelukast', 'fluticasone'], 'lungs', 'opens or calms the airways'],
  [['omeprazole', 'esomeprazole', 'pantoprazole', 'lansoprazole'], 'digestion', 'lowers stomach acid'],
  [['calcium', 'alendronate', 'vitamin d'], 'skeleton', 'looks after bones']
]
export interface Acting { name: string; effect: string }
/** Live medicines of the person that act on `system`, with a short effect. */
export function medicinesActingHere(meds: Medication[], system: string): Acting[] {
  const out: Acting[] = []
  for (const m of meds) {
    if ((m.medStatus ?? 'active') !== 'active' || (m as { deletedAt?: unknown }).deletedAt) continue
    const n = `${normaliseDrug(m.genericName) ?? ''} ${normaliseDrug(m.name) ?? ''}`
    const hit = DRUG_SYSTEM.find(([names, sys]) => sys === system && names.some((d) => n.includes(d)))
    if (hit) out.push({ name: [m.name, m.strength].filter(Boolean).join(' '), effect: hit[2] })
  }
  return out
}

/** "BP 126/80 · pulse 72" for the latest readings that belong to the system, and the metric to open. null when there are none. */
export function yourNumbers(system: string, latest: Reading[]): { text: string; code: string } | null {
  const mine = latest.filter((r) => systemOf(r.test) === system)
  if (mine.length === 0) return null
  const sys = mine.find((r) => r.test === 'bp_systolic')
  const dia = mine.find((r) => r.test === 'bp_diastolic')
  const parts = [
    ...(sys ? [`Blood pressure ${formatNumber(sys.value)}${dia ? `/${formatNumber(dia.value)}` : ''}`] : []),
    ...mine.filter((r) => !r.test.startsWith('bp_')).slice(0, 3).map((r) => `${metricLabel(r.test)} ${formatNumber(r.value)}${r.unit ? ` ${r.unit}` : ''}`)
  ]
  return { text: parts.join(' · '), code: sys ? 'bp_systolic' : mine[0]!.test }
}
