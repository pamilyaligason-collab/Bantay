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

/** Per-phone switches that live in their own localStorage keys (family/flags.ts, weather/flags.ts). Off by default: '1' is on, no key is off. On by default (the family map, D-143): '0' is off, no key is on. */
const KEYED: [key: string, title: string, sub: string, defOn: boolean][] = [
  ['bantay.flag.places', 'Family map (place sharing)', 'Your place on the family map', true],
  ['bantay.flag.feed', 'Family feed', 'What each person shares, in Family', false],
  ['bantay.flag.wx.blend', 'Weather blend (beta)', 'Blended forecast, beta', false]
]
const defOnOf = (k: string) => KEYED.find(([key]) => key === k)?.[3] ?? false
const keyedOn = (k: string) => { const d = defOnOf(k); try { const v = localStorage.getItem(k); return d ? v !== '0' : v === '1' } catch { return d } }
/** Stores the change from the default ('1' on, '0' off) or removes the key when it matches the default, then reloads (screens already mounted keep the old answer). */
export function setKeyedFlag(k: string, on: boolean, reload: () => void = () => location.reload()) {
  const d = defOnOf(k)
  try { if (on === d) localStorage.removeItem(k); else localStorage.setItem(k, on ? '1' : '0') } catch { return }
  reload()
}

/** Settings overview, admins only: one switch per flag. Flips this phone only. */
export default function LabsGroup({ reload }: { reload?: () => void }) {
  const now = readFlags()
  return (
    <>
      <div className="sh-card sh-list st-list" data-testid="settings-labs">
        {(Object.keys(DEFAULTS) as (keyof Flags)[]).map((k) => <SwitchRow key={k} icon="gear" tint="none" title={NAMES[k][0]} sub={NAMES[k][1]} on={now[k]} onChange={(v) => setFlag(k, v, reload)} />)}
        {KEYED.map(([k, title, sub]) => <SwitchRow key={k} icon="gear" tint="none" title={title} sub={sub} on={keyedOn(k)} onChange={(v) => setKeyedFlag(k, v, reload)} />)}
      </div>
      <p className="sh-sub sh-note">Labs: early features, this phone only. The page reloads when you flip one.</p>
    </>
  )
}
