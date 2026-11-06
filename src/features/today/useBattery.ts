import { useEffect, useState } from 'react'

export type Battery = { level: number; charging: boolean }
type Mgr = { level: number; charging: boolean; addEventListener: (t: string, f: () => void) => void; removeEventListener: (t: string, f: () => void) => void }
const mgr = (): Promise<Mgr> | undefined => (navigator as unknown as { getBattery?: () => Promise<Mgr> }).getBattery?.()
const snap = (m: Mgr): Battery | null => (Number.isFinite(m.level) && m.level >= 0 && m.level <= 1 ? { level: m.level, charging: !!m.charging } : null) // unknown is null, never 0 (ML-05)

/** One read of the phone battery. null where the browser does not share it (iOS Safari, Firefox) or the read fails. */
export async function readBattery(): Promise<Battery | null> {
  try { const m = await mgr(); return m ? snap(m) : null } catch { return null }
}

/** The live battery, or null where unsupported: the card then stays hidden and no number is invented. */
export function useBattery(): Battery | null {
  const [b, setB] = useState<Battery | null>(null)
  useEffect(() => {
    let gone = false
    let off = () => {}
    void (async () => {
      try {
        const m = await mgr()
        if (!m || gone) return
        const f = () => { if (!gone) setB(snap(m)) }
        f()
        m.addEventListener('levelchange', f); m.addEventListener('chargingchange', f)
        off = () => { m.removeEventListener('levelchange', f); m.removeEventListener('chargingchange', f) }
      } catch { /* not supported: stays null */ }
    })()
    return () => { gone = true; off() }
  }, [])
  return b
}
