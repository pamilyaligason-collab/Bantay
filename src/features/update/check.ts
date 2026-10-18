export interface Latest { versionCode: number; versionName: string; url: string; sha256: string; size: number; minShell: number; notes: string }
const GH = /^https:\/\/github\.com\/pamilyaligason-collab\/Bantay\/releases\/download\/[^/]+\/[^/]+\.apk$/
export function parseLatest(x: unknown): Latest | null {
  const o = x as Partial<Latest> | null
  if (!o || typeof o !== 'object') return null
  const okNum = (n: unknown) => typeof n === 'number' && Number.isInteger(n) && n >= 0
  if (!okNum(o.versionCode) || !okNum(o.size) || !okNum(o.minShell)) return null
  if (typeof o.url !== 'string' || !GH.test(o.url)) return null
  if (typeof o.sha256 !== 'string' || !/^[0-9a-f]{64}$/i.test(o.sha256)) return null
  if (typeof o.versionName !== 'string' || typeof o.notes !== 'string') return null
  return o as Latest
}
export type Decision = { kind: 'none' } | { kind: 'ready' | 'required'; latest: Latest }
export function decide(shell: { versionCode: number }, l: Latest): Decision {
  if (shell.versionCode === 0) return { kind: 'none' } // PWA or browser
  if (shell.versionCode < l.minShell) return { kind: 'required', latest: l }
  return shell.versionCode < l.versionCode ? { kind: 'ready', latest: l } : { kind: 'none' }
}
export const needsShell = (shell: { versionCode: number }, min: number) => shell.versionCode !== 0 && shell.versionCode < min

export const CHECK_EVERY = 6 * 3600_000
/** Throttle: one network check per 6 h unless forced (Me > Check for updates). A clock set back counts as due. */
export const checkDue = (checkedAt: unknown, now: number, force = false) =>
  force || typeof checkedAt !== 'number' || now - checkedAt >= CHECK_EVERY || now < checkedAt
