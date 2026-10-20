// Entry points to the scan flow (route #scan). The state flag lets Close go back to where the person came from.
export const SCAN_HASH = '#scan'

export function openScan() {
  history.pushState({ bantayScan: 1 }, '', SCAN_HASH)
  window.dispatchEvent(new HashChangeEvent('hashchange')) // pushState is silent; App listens for this
}

/** Leave the flow: Back if we came in through openScan, else straight to Health > Papers. */
export function closeScan() {
  if (history.state?.bantayScan) history.back()
  else location.hash = '#health/papers'
}
