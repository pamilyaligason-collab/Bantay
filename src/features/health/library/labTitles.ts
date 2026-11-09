/** S28: a small fixed map from every lab in labGlossary.ts to (a) the names a result may carry, (b) the mdwiki article title in the full library pack and (c) the LOINC code for MedlinePlus Connect.
 *  It lives in the main bundle on purpose: if the glossary chunk fails to load, a lab still resolves and never reaches the medicine (RxNorm) look-up.
 *  Titles were checked against the title index of pack medlib-mdwiki-2026-11-09 (null = the pack has no article of that name). explainer.s28.test.tsx keeps it in step with the glossary. */
export interface LabTitle { code: string; names: string[]; loinc: string; title: string | null }

export const LAB_TITLES: LabTitle[] = [
  { code: 'alt', names: ['ALT', 'ALT (SGPT)', 'SGPT', 'alt/sgpt', 'alanine aminotransferase'], loinc: '1742-6', title: 'Alanine transaminase' },
  { code: 'ast', names: ['AST', 'AST (SGOT)', 'SGOT', 'ast/sgot', 'aspartate aminotransferase'], loinc: '1920-8', title: 'Transaminase' },
  { code: 'creatinine', names: ['Creatinine', 'crea', 'createnine', 'serum creatinine'], loinc: '2160-0', title: null },
  { code: 'egfr', names: ['eGFR', 'gfr', 'estimated gfr'], loinc: '98979-8', title: 'Glomerular filtration rate' },
  { code: 'bun', names: ['bun', 'Blood urea nitrogen', 'urea nitrogen', 'urea'], loinc: '3094-0', title: 'Blood urea nitrogen' },
  { code: 'uric_acid', names: ['Uric acid', 'uricacid', 'bua'], loinc: '3084-1', title: 'Uric acid' },
  { code: 'fasting_glucose', names: ['Fasting glucose', 'fbs', 'fasting blood sugar', 'glucose fasting'], loinc: '1558-6', title: 'Blood sugar level' },
  { code: 'random_glucose', names: ['Random glucose', 'rbs', 'random blood sugar', 'glucose random', 'glucose'], loinc: '2345-7', title: 'Blood sugar level' },
  { code: 'hba1c', names: ['HbA1c', 'hba1c ngsp', 'glycated hemoglobin', 'glycosylated hemoglobin', 'a1c'], loinc: '4548-4', title: 'Glycated hemoglobin' },
  { code: 'total_cholesterol', names: ['Total cholesterol', 'cholesterol', 'totalcholesterol'], loinc: '2093-3', title: 'Cholesterol' },
  { code: 'ldl', names: ['LDL', 'LDL cholesterol', 'ldl-c', 'ldlcholesterol'], loinc: '13457-7', title: 'Low-density lipoprotein' },
  { code: 'hdl', names: ['HDL', 'HDL cholesterol', 'hdl-c', 'hdlcholesterol'], loinc: '2085-9', title: 'High-density lipoprotein' },
  { code: 'triglycerides', names: ['Triglycerides', 'trigly', 'tg', 'triglyceride'], loinc: '2571-8', title: null },
  { code: 'hemoglobin', names: ['Hemoglobin', 'hgb', 'hb', 'haemoglobin'], loinc: '718-7', title: 'Hemoglobin' },
  { code: 'hematocrit', names: ['Hematocrit', 'hct', 'haematocrit', 'pcv'], loinc: '4544-3', title: 'Hematocrit' },
  { code: 'rbc', names: ['rbc', 'Red blood cells', 'red blood cell count', 'rbc count'], loinc: '789-8', title: 'Red blood cell' },
  { code: 'wbc', names: ['wbc', 'White blood cells', 'white blood cell count', 'wbc count'], loinc: '6690-2', title: 'White blood cell' },
  { code: 'platelets', names: ['Platelets', 'plt', 'platelet count', 'platelet'], loinc: '777-3', title: 'Platelet' },
  { code: 'tsh', names: ['TSH', 'thyroid stimulating hormone'], loinc: '3016-3', title: 'Thyroid-stimulating hormone' },
]

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
const INDEX = new Map<string, LabTitle>()
for (const e of LAB_TITLES) for (const k of [e.code, ...e.names]) INDEX.set(squash(k), e)

/** The lab a result name, code or alias stands for, or null. Same matching as labEntry (case-blind, punctuation ignored), without the glossary chunk. */
export const labTitle = (text: string): LabTitle | null => INDEX.get(squash(text)) ?? null
