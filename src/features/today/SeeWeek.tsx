import { useState } from 'react'
import MyWeek from './MyWeek'

/** "See the week" (mockup v8): My week is no longer a block on Today. This link row opens the same My week tiles right under it, and closes them again. */
export default function SeeWeek() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" className="td-seeweek press" aria-expanded={open} aria-controls="t-week-panel" onClick={() => setOpen(!open)}>
        <b>{open ? 'Hide the week' : 'See the week'}</b>
        <span className="td-link" aria-hidden="true">{open ? 'Close' : 'My week'}</span>
      </button>
      {open && <div id="t-week-panel"><MyWeek /></div>}
    </>
  )
}
