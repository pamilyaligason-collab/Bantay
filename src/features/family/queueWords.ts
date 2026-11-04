/** One place for the paper-queue numbers (ML-34): `count` is every pending paper in the family, `byPerson[me]` is the caller's own. */
export interface QueueLike { count: number; byPerson: Record<string, number> }

export const queueWords = (q: QueueLike, meId: string | undefined): string => {
  if (q.count <= 0) return 'Nothing waiting'
  const mine = (meId && q.byPerson[meId]) || 0
  return `${q.count} to confirm · ${mine} yours`
}

/** Papers header kicker, same object. */
export const queueKicker = (q: QueueLike): string => (q.count > 0 ? `${q.count} in the family` : ' ')
