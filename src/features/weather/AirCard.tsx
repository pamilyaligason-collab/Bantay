import type { LatLon } from '../location/geo'
import { Section } from '../look/Section'
import { bandOf, useAir } from './airQuality'

/** Philippine air quality (DENR scale) for the place: a coloured chip, the number, and a caution for levels 3 to 6. Unknown reads "not available", never Good. */
export default function AirCard({ point }: { point: LatLon | null }) {
  const { air, stale } = useAir(point)
  if (air === undefined) return null
  const mean = air?.mean ?? null
  const b = mean == null ? null : bandOf(mean)
  return (
    <Section title="Air quality" testId="wx-aqi">
      <div className="card wx-aqi">
        {b && mean != null ? (
          <>
            <span className="wx-aqi-chip" style={{ background: b.bg, color: b.ink }}><b>{b.label}</b><span>Level {b.id} of 6</span></span>
            {b.say && <p className="wx-aqi-say">{b.say}</p>}
            <span className="wx-sub wx-aqi-n">Fine dust (PM2.5): {mean} µg/m³</span>
          </>
        ) : <p className="wx-sub">Air quality is not available now.</p>}
        <span className="wx-sub">DENR scale, 24-hour average.{stale ? ' Older reading; could not refresh.' : ''}</span>
      </div>
    </Section>
  )
}
