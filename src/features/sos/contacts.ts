import type { FamilyMember } from '../auth/family'

/** One SOS text contact. Phones live only on this phone (kv `sos.contacts`); the SMS fallback needs them (D-34). */
export interface SosContact { name: string; phone: string; personId?: string }
export const MAX_SOS = 2

const PHONE_CHARS = /^\+?[\d\s-]+$/
/** Loose PH check: digits, +, spaces and dashes only, 10 to 13 digits (09171234567, +63 917 123 4567). */
export function validPhone(p: string): boolean {
  const s = p.trim()
  if (!PHONE_CHARS.test(s)) return false
  const n = s.replace(/\D/g, '').length
  return n >= 10 && n <= 13
}

/** Read any stored shape (current objects, old personId strings, old phone strings) as SosContact[], max 2. */
export function normalizeContacts(raw: unknown, family: FamilyMember[]): SosContact[] {
  if (!Array.isArray(raw)) return []
  const out: SosContact[] = []
  for (const r of raw) {
    if (typeof r === 'string') {
      const f = family.find((m) => m.personId === r)
      if (f) out.push({ name: f.displayName, phone: '', personId: f.personId })
      else if (PHONE_CHARS.test(r.trim())) out.push({ name: 'Contact', phone: r.trim() })
    } else if (r && typeof r === 'object' && typeof (r as SosContact).name === 'string' && typeof (r as SosContact).phone === 'string') {
      const c = r as SosContact
      out.push({ name: c.name.slice(0, 60), phone: c.phone.slice(0, 20), ...(typeof c.personId === 'string' ? { personId: c.personId } : {}) })
    }
  }
  return out.slice(0, MAX_SOS)
}

/** The wizard probe: done when two contacts each have a valid phone. */
export const sosDone = (raw: unknown, family: FamilyMember[]): boolean => {
  const c = normalizeContacts(raw, family)
  return c.length >= MAX_SOS && c.every((x) => validPhone(x.phone))
}
