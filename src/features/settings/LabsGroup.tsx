import { DEFAULTS, readFlags, type Flags } from '../safety/flags'
import { SwitchRow } from './Group'

const KEY = 'bantay.flags' // the one place the flags module reads (safety/flags.ts)
const NAMES: Record<keyof Flags, [string, string]> = {
  worldFeeds: ['World news', 'Headlines and macro panels'],
  offlineMaps: ['Offline maps', 'Area maps on the phone'],
  firstAidOffline: ['First aid offline', 'Guides saved on the phone'],
  phivolcs: ['Volcano levels', 'PHIVOLCS alert levels'],
  smsFallback: ['SMS fallback', 'Text when there is no data'],
  localPacks: ['Local hazard packs', 'Hazard rings and layers'],
  eonet: ['NASA events', 'EONET rows on World'],
  digest: ['Daily digest', 'The World digest card']
}

/** Writes one flag into the stored flags (other keys kept), then reloads: the flags are read once at load. */
export function setFlag(k: keyof Flags, on: boolean, reload: () => void = () => location.reload()) {
  try { localStorage.setItem(KEY, JSON.stringify({ ...readFlags(), [k]: on })) } catch { return }
  reload()
}

/** Settings overview, admins only: one switch per flag. Flips this phone only. */
export default function LabsGroup({ reload }: { reload?: () => void }) {
  const now = readFlags()
  return (
    <>
      <div className="sh-card sh-list st-list" data-testid="settings-labs">
        {(Object.keys(DEFAULTS) as (keyof Flags)[]).map((k) => <SwitchRow key={k} icon="gear" tint="none" title={NAMES[k][0]} sub={NAMES[k][1]} on={now[k]} onChange={(v) => setFlag(k, v, reload)} />)}
      </div>
      <p className="sh-sub sh-note">Labs: early features, this phone only. The page reloads when you flip one.</p>
    </>
  )
}
