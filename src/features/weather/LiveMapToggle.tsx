import { useState, type ReactNode } from 'react'
import type { LatLon } from '../location/geo'
import LiveMaps from '../safety/LiveMaps'

/** Live Windy/Ventusky maps stay closed until asked: nothing loads, no data is used. Used by the Weather screen and the Safety weather page. */
export default function LiveMapToggle({ loc, more }: { loc: LatLon; more?: ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <section aria-label="Live weather map" className="wx-map">
      <button type="button" className="pill ghost block" aria-expanded={open} onClick={() => setOpen((o) => !o)}>{open ? 'Hide live map' : 'Open live map'}</button>
      {open && (
        <>
          <LiveMaps loc={loc} />
          {more}
        </>
      )}
    </section>
  )
}
