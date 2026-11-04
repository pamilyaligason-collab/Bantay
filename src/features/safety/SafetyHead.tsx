import type { ReactNode } from 'react'
import { LargeTitle, Segmented } from '../look'
import { HeadActions } from '../shell/HeadActions'

/** The Safety root head: kicker, title, place chip, and the Near me | World switch (both halves look the same). */
export function SafetyHead(p: { view: 'near' | 'world'; kicker?: string; actions?: ReactNode }) {
  return (
    <>
      <LargeTitle title="Safety" kicker={p.kicker} actions={<HeadActions />} below={p.actions} />
      <Segmented label="Show" value={p.view} options={[{ id: 'near', label: 'Near me', href: '#safety' }, { id: 'world', label: 'World', href: '#safety/world' }]} />
    </>
  )
}
