export interface RefreshDetail { waitUntil: (p: Promise<unknown>) => void }

/**
 * Refresh contract. Listen with window.addEventListener('bantay:refresh', (e) => (e as CustomEvent<RefreshDetail>).detail.waitUntil(reload())).
 * The pull-to-refresh spinner stays up until every registered promise settles.
 */
export async function requestRefresh(): Promise<void> {
  const pending: Promise<unknown>[] = []
  window.dispatchEvent(new CustomEvent<RefreshDetail>('bantay:refresh', { detail: { waitUntil: (p) => void pending.push(p) } }))
  await Promise.allSettled(pending)
}
