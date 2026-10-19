import { handleCandidate } from './handle.ts'
import { SYNTHETIC_DOMAIN, derivePassword, normalizeEmail, normalizeHandle, randomSecret, syntheticEmail, validatePin } from './pin.ts'

export type Role = 'admin' | 'member'
export interface Profile { photoPath: string | null; phone: string | null; birthdate: string | null; bloodType: string | null; allergies: string[]; conditions: string[]; medicines: string[] }
export interface Member { userId: string; personId: string | null; displayName: string; handle: string | null; role: Role; disabled: boolean; lastSignInAt: string | null; provider: string | null; profile: Profile | null }
export type Err = 'not_admin' | 'bad_input' | 'handle_taken' | 'not_found'
export type Result = { ok: true; [k: string]: unknown } | { ok: false; error: Err }

/** Everything the dispatcher needs from the outside world; index.ts adapts the service-role client to this. */
export interface Port {
  pepper: string
  createAuthUser(email: string, tempPassword: string, displayName: string): Promise<string | null> // returns user id
  deleteAuthUser(userId: string): Promise<void>
  getAuthEmail(userId: string): Promise<string | null>
  setPassword(userId: string, password: string): Promise<boolean>
  setBanned(userId: string, banned: boolean): Promise<boolean>
  deletePushSubscriptions(userId: string): Promise<boolean> // a disabled member gets no broadcasts
  revokeSessions(userId: string): Promise<boolean> // public.revoke_sessions: ends every session of the user
  clearPinLock(userId: string): Promise<boolean> // deletes the pin_attempts row, so a locked member can try again at once
  insertRole(userId: string, role: Role, handle: string): Promise<'ok' | 'handle_taken' | 'error'>
  updateRole(userId: string, patch: { role?: Role; handle?: string; disabled?: boolean }): Promise<'ok' | 'handle_taken' | 'not_found'>
  insertPerson(userId: string, displayName: string, createdBy: string): Promise<string | null> // returns person id
  addInvite(email: string, by: string): Promise<boolean>
  removeInvite(email: string): Promise<boolean>
  updatePerson(personId: string, patch: PersonPatch): Promise<'ok' | 'not_found' | 'error'>
  listMembers(): Promise<Member[]>
}

/** Columns of public.people an admin may set (snake_case, as in 0010). A key that is absent is left alone; null clears it. */
export type PersonPatch = Partial<{ display_name: string; photo_path: string | null; phone: string | null; birthdate: string | null; blood_type: string | null; allergies: string[]; conditions: string[]; medicines: string[] }>
export const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']

const list = (v: unknown): string[] | null => {
  if (!Array.isArray(v) || v.length > 30) return null
  const out: string[] = []
  for (const x of v) {
    if (typeof x !== 'string') return null
    const t = x.replace(/\s+/g, ' ').trim()
    if (t.length > 40) return null
    if (t && !out.some((o) => o.toLowerCase() === t.toLowerCase())) out.push(t)
  }
  return out
}
const validDate = (v: string): boolean => {
  const d = new Date(v + 'T00:00:00Z')
  return /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v && v >= '1900-01-01' && d.getTime() <= Date.now()
}

/** Checks the 'update' body. Returns null for anything malformed or empty (never a partial guess). */
export function parsePersonPatch(b: Record<string, unknown>, personId: string): PersonPatch | null {
  const p: PersonPatch = {}
  if ('displayName' in b) {
    const n = typeof b.displayName === 'string' ? b.displayName.trim() : ''
    if (!n || n.length > 80) return null
    p.display_name = n
  }
  if ('phone' in b) {
    if (b.phone === null || b.phone === '') p.phone = null
    else if (typeof b.phone === 'string' && /^[0-9+()\- ]{3,30}$/.test(b.phone.trim())) p.phone = b.phone.trim()
    else return null
  }
  if ('birthdate' in b) {
    if (b.birthdate === null || b.birthdate === '') p.birthdate = null
    else if (typeof b.birthdate === 'string' && validDate(b.birthdate)) p.birthdate = b.birthdate
    else return null
  }
  if ('bloodType' in b) {
    if (b.bloodType === null || b.bloodType === '') p.blood_type = null
    else if (typeof b.bloodType === 'string' && BLOOD_TYPES.includes(b.bloodType)) p.blood_type = b.bloodType
    else return null
  }
  if ('photoPath' in b) {
    if (b.photoPath === null) p.photo_path = null
    else if (b.photoPath === `${personId.toLowerCase()}.jpg`) p.photo_path = b.photoPath // the only object the avatars policy lets anyone write
    else return null
  }
  for (const k of ['allergies', 'conditions', 'medicines'] as const) {
    if (!(k in b)) continue
    const l = list(b[k])
    if (!l) return null
    p[k] = l
  }
  return Object.keys(p).length ? p : null
}

const bad: Result = { ok: false, error: 'bad_input' }
const isId = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v)
const isRole = (v: unknown): v is Role => v === 'admin' || v === 'member'

function fromUpdate(r: 'ok' | 'handle_taken' | 'not_found'): Result {
  return r === 'ok' ? { ok: true } : { ok: false, error: r }
}

/** Caller is already verified as admin by index.ts. callerId stops an admin locking themselves out. */
export async function runAction(body: unknown, port: Port, callerId: string): Promise<Result> {
  if (typeof body !== 'object' || body === null) return bad
  const b = body as Record<string, unknown>
  switch (b.action) {
    case 'create': {
      const name = typeof b.displayName === 'string' ? b.displayName.trim() : ''
      const auto = b.handle === undefined || b.handle === null || b.handle === '' // no handle given: derive it from the name
      const given = auto ? null : normalizeHandle(b.handle)
      if (!name || name.length > 80 || (!auto && !given) || !validatePin(b.pin) || !isRole(b.role) || b.role === 'admin') return bad // admins sign in with Google only, never with a PIN
      // The user id is not known until Supabase makes it, so create with a throwaway password, then set the derived one.
      const userId = await port.createAuthUser(syntheticEmail(), randomSecret(), name)
      if (!userId) return bad
      const undo = async (e: Err): Promise<Result> => { await port.deleteAuthUser(userId); return { ok: false, error: e } }
      let r: 'ok' | 'handle_taken' | 'error' = 'handle_taken'
      for (let n = 1; n <= (auto ? 50 : 1) && r === 'handle_taken'; n++) r = await port.insertRole(userId, b.role, auto ? handleCandidate(name, n) : given!) // macleofe, macleofe2, macleofe3 ...
      if (r !== 'ok') return undo(r === 'handle_taken' ? 'handle_taken' : 'bad_input')
      if (!(await port.setPassword(userId, await derivePassword(port.pepper, userId, b.pin)))) return undo('bad_input')
      const personId = await port.insertPerson(userId, name, callerId)
      if (!personId) return undo('bad_input')
      return { ok: true, userId, personId }
    }
    case 'update': {
      if (!isId(b.personId)) return bad
      const patch = parsePersonPatch(b, b.personId)
      if (!patch) return bad
      const r = await port.updatePerson(b.personId, patch)
      return r === 'ok' ? { ok: true } : r === 'not_found' ? { ok: false, error: 'not_found' } : bad
    }
    case 'set_pin': {
      if (!isId(b.userId) || !validatePin(b.pin)) return bad
      const email = await port.getAuthEmail(b.userId)
      if (!email) return { ok: false, error: 'not_found' }
      if (!email.endsWith('@' + SYNTHETIC_DOMAIN)) return bad // Google members have no PIN
      if (!(await port.setPassword(b.userId, await derivePassword(port.pepper, b.userId, b.pin)))) return bad
      return (await port.revokeSessions(b.userId)) ? { ok: true } : bad // the old PIN's sessions must not outlive the reset
    }
    case 'unlock': {
      if (!isId(b.userId)) return bad
      return (await port.clearPinLock(b.userId)) ? { ok: true } : bad
    }
    case 'set_handle': {
      const handle = normalizeHandle(b.handle)
      if (!isId(b.userId) || !handle) return bad
      return fromUpdate(await port.updateRole(b.userId, { handle }))
    }
    case 'set_role': {
      if (!isId(b.userId) || !isRole(b.role) || b.userId === callerId) return bad
      if (b.role === 'admin') {
        const email = await port.getAuthEmail(b.userId)
        if (!email) return { ok: false, error: 'not_found' }
        if (email.endsWith('@' + SYNTHETIC_DOMAIN)) return bad // PIN members cannot be admins
      }
      return fromUpdate(await port.updateRole(b.userId, { role: b.role }))
    }
    case 'disable': {
      if (!isId(b.userId) || typeof b.disabled !== 'boolean' || b.userId === callerId) return bad
      const r = await port.updateRole(b.userId, { disabled: b.disabled })
      if (r !== 'ok') return fromUpdate(r)
      if (!(await port.setBanned(b.userId, b.disabled))) return bad // also blocks Google sign-in and token refresh
      if (!b.disabled) return { ok: true }
      if (!(await port.deletePushSubscriptions(b.userId))) return bad
      return (await port.revokeSessions(b.userId)) ? { ok: true } : bad
    }
    case 'invite': {
      const email = normalizeEmail(b.email)
      return email && (await port.addInvite(email, callerId)) ? { ok: true } : bad
    }
    case 'uninvite': {
      const email = normalizeEmail(b.email)
      return email && (await port.removeInvite(email)) ? { ok: true } : bad
    }
    case 'list':
      return { ok: true, members: await port.listMembers() }
    default:
      return bad
  }
}
