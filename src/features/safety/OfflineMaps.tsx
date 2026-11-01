import { GroupedList, LargeTitle, Row, Section } from '../look'
import { Switch } from '../world/Switch'
import { FLAGS } from './flags'
import { putKv, useKv } from './store'
import './offline.css'

const KEY = 'safety.offlinePrefs'
const DEFAULT = { wifiOnly: true, monthly: true }
const REGIONS = ['Bohol', 'Mindanao', 'Rest of the Visayas', 'Luzon']

/** Offline map packs. No pack exists yet, so with the flag off this is an honest empty state; with it on, only the saved choices and "Not downloaded". */
export default function OfflineMaps() {
  const raw = useKv<Partial<typeof DEFAULT> | undefined>(KEY, undefined)
  const prefs = { ...DEFAULT, ...(raw ?? {}) }
  const set = (patch: Partial<typeof DEFAULT>) => void putKv(KEY, { ...prefs, ...patch })
  return (
    <>
      <LargeTitle title="Offline maps" back={{ href: '#safety', label: 'Safety' }} />
      {!FLAGS.offlineMaps ? (
        <p className="ofm-empty">Offline maps are not ready yet. They arrive with the Bohol map pack.</p>
      ) : (
        <>
          <Section title="Downloads">
            <GroupedList label="Download settings">
              <Row title="Wi-Fi only" control={<Switch on={prefs.wifiOnly} label="Wi-Fi only" onChange={(on) => set({ wifiOnly: on })} />} />
              <Row title="Update monthly" control={<Switch on={prefs.monthly} label="Update monthly" onChange={(on) => set({ monthly: on })} />} />
            </GroupedList>
          </Section>
          <Section title="Regions">
            <GroupedList label="Regions">{REGIONS.map((r) => <Row key={r} icon="map" tint="blue" title={r} value="Not downloaded" />)}</GroupedList>
            <p className="ofm-foot">Maps © OpenStreetMap contributors.</p>
          </Section>
        </>
      )}
    </>
  )
}
