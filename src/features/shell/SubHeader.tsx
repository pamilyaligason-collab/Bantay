import type { ReactNode } from 'react'
import { LargeTitle } from '../look/LargeTitle'

/** Sub-page header: the v13 Back row (parent name) over the large title, optional trailing control on the right. `className` is accepted for old callers and ignored. */
export function SubHeader({ title, backHref, backLabel = 'Back', trailing }: { title: string; backHref: string; backLabel?: string; trailing?: ReactNode; className?: string }) {
  return <LargeTitle title={title} back={{ href: backHref, label: backLabel.replace(/^Back to /, '') }} actions={trailing} />
}
