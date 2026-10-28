import { useMemo } from 'react'
import type { HeroCard } from './heroCards'
import { doseKey, pickNext, type NextItem } from './nextPick'
import { useUnsnoozed } from './useSnoozed'
import { usePlanCard } from './planCard'
import { useDueMeds } from './useDueMeds'
import { useStorm } from './useStorm'

/** The one Next up pick plus the count of medicines to check. Today reads it once: a calm pick means no Next up card and an expanded weather card. */
export function useNext(): { item: NextItem; review: number } {
  const { due: all, review, tick } = useDueMeds()
  const due = useUnsnoozed(all, doseKey) // "In 10 min" hides only that dose's card
  const plan = usePlanCard(tick)
  const storm = useStorm()
  const item = useMemo(() => pickNext({ due, plan: plan as HeroCard | null, storm }, tick), [due, plan, storm, tick])
  return { item, review }
}
