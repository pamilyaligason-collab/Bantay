// Sign-in name rule, shared by the admin-members function (the authority) and the Admin screen (a live preview). No imports, so Deno and the app both load it.
export const HANDLE_MAX = 20

/** "Macleo Fé" -> "macleofe": lowercase, accents stripped, a-z 0-9 only, no leading digits, 3 to 20 characters. */
export function handleBase(name: string): string {
  const s = name.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]/g, '').replace(/^[0-9]+/, '')
  return (s || 'member').padEnd(3, 'x').slice(0, HANDLE_MAX)
}

/** n = 1 is the plain name; n >= 2 adds the number (macleofe2, macleofe3), cut so the whole handle stays within 20. */
export function handleCandidate(name: string, n = 1): string {
  const base = handleBase(name)
  if (n <= 1) return base
  const suffix = String(n)
  return base.slice(0, HANDLE_MAX - suffix.length) + suffix
}

/** First candidate not in `taken` (lowercase handles). Preview only: the server settles races by retrying on handle_taken. */
export function pickHandle(name: string, taken: ReadonlySet<string>): string {
  for (let n = 1; n < 1000; n++) {
    const h = handleCandidate(name, n)
    if (!taken.has(h)) return h
  }
  return handleCandidate(name, 1000)
}
