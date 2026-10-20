import type { ProfileFields } from '../../db'
import { isLive } from '../health/meds'
import type { Medication } from '../log/store'
import { UNKNOWN } from '../setup/lists'
import type { SosContact } from '../sos/contacts'

/** What the Medical ID screen shows. Every list can be empty and every scalar null: unknown is never made up and never 0. */
export interface MedicalId {
  name: string
  age: number | null
  bloodType: string | null
  allergies: string[]
  conditions: string[]
  medicines: string[]
  calls: { name: string; phone: string }[]
  /** Sections the person has not answered. UNKNOWN ("not sure") counts as answered. */
  missing: ('bloodType' | 'allergies' | 'conditions' | 'medicines' | 'calls')[]
}

/** Whole years from a YYYY-MM-DD birthdate, null when it is missing, unreadable or in the future. */
export function ageOf(birthdate: string | null | undefined, now: Date): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(birthdate ?? '')
  if (!m) return null
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  let a = now.getFullYear() - y
  if (now.getMonth() + 1 < mo || (now.getMonth() + 1 === mo && now.getDate() < d)) a--
  return a >= 0 && a < 130 ? a : null
}

const clean = (l: readonly string[] | undefined) => (l ?? []).map((s) => s.trim()).filter(Boolean)

/** `medications` = this person's medications rows (the live schedule). Only active ones are listed, by name (no times, doses or stock).
 *  @deprecated When it is not given the profile text list `profile.medicines` is used; that path goes once every caller passes medications. */
export function buildMedicalId(o: { name: string; profile: Partial<ProfileFields> | null | undefined; contacts: SosContact[]; now: Date; medications?: Medication[] }): MedicalId {
  const p = o.profile ?? {}
  const allergies = clean(p.allergies), conditions = clean(p.conditions)
  const medicines = o.medications
    ? [...new Set(clean(o.medications.filter(isLive).map((m) => m.name)))]
    : clean(p.medicines)
  const calls = o.contacts.filter((c) => c.phone.trim()).map((c) => ({ name: c.name.trim() || 'Contact', phone: c.phone.trim() }))
  const bloodType = p.bloodType?.trim() || null
  const missing: MedicalId['missing'] = []
  if (!bloodType) missing.push('bloodType')
  if (!allergies.length) missing.push('allergies')
  if (!conditions.length) missing.push('conditions')
  if (!medicines.length) missing.push('medicines')
  if (!calls.length) missing.push('calls')
  return { name: o.name.trim(), age: ageOf(p.birthdate, o.now), bloodType, allergies, conditions, medicines, calls, missing }
}

/** Display text for a list or value. "Not sure" for UNKNOWN, "Not added" for blank. */
export const show = (v: string | string[] | null): string => {
  const l = Array.isArray(v) ? v : v ? [v] : []
  if (!l.length) return 'Not added'
  return l[0] === UNKNOWN ? 'Not sure' : l.join(', ')
}

/** Worth keeping offline: at least one real answer (so a blank row never overwrites a good cache). */
export const hasData = (c: MedicalId): boolean => c.bloodType !== null || c.allergies.length > 0 || c.conditions.length > 0 || c.medicines.length > 0 || c.age !== null
