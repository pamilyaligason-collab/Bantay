import { type ReactNode, useState } from 'react'

/** A <details> whose children mount only once it is opened, so embedded maps do not load (or use data) until asked. */
export default function Lazy({ summary, children }: { summary: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <details onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>{summary}</summary>
      {open && children}
    </details>
  )
}
