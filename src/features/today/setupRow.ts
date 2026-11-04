import { useEffect, useState } from 'react'
import { currentPlatform, onResume, probe, remaining, SETUP_LABEL, type StepId } from '../setup/steps'

/** Where each setup step is done: the row opens the first pending step's own screen, not one catch-all page. */
export const SETUP_HREF: Record<StepId, string> = {
  photo: '#me', about: '#me/about', medicines: '#health/meds', notifications: '#me/alerts', location: '#me/phone',
  health: '#me/phone', warnings: '#me/phone', sos: '#me/family', sharing: '#me/family'
}

/** The pending steps in order, each with its label and own route. */
export const setupSteps = (left: StepId[]): { label: string; href: string }[] => left.map((s) => ({ label: SETUP_LABEL[s], href: SETUP_HREF[s] }))

/** Re-reads when the app comes back to the front (same source as setup/steps useSetupLeft). */
export function useSetupSteps(): { label: string; href: string }[] {
  const [steps, set] = useState<{ label: string; href: string }[]>([])
  useEffect(() => {
    let live = true
    const run = () => { void probe().then((p) => { if (live) set(setupSteps(remaining(p, currentPlatform()))) }).catch(() => undefined) }
    run()
    const off = onResume(run)
    return () => { live = false; off() }
  }, [])
  return steps
}
