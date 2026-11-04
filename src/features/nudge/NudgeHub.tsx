import { liveQuery } from 'dexie'
import { useEffect, useState } from 'react'
import { useFamilyPeople } from '../family/roster'
import { canMarkFor, useWritableIds } from '../health/useCanMark'
import { useMedications } from '../health/useMedications'
import { ldb, type MedTaken } from '../log/store'
import { WhoLine } from '../health/WhoLine'
import { useHealthData } from '../records/useHealthData'
import { SubHeader } from '../shell/SubHeader'
import { Kudos } from './Kudos'
import { Pillbox } from './Pillbox'
import { Pixels } from './Pixels'
import { Recap } from './Recap'
import { ReminderCard } from './ReminderCard'
import './nudgeHub.css'

const NONE: MedTaken[] = []

/** Health > My progress (#health/nudge): your week recap, the pillbox, the year in pixels, kudos for the family and the reply reminder. */
export default function NudgeHub() {
  const { member, ownId, personId, readings } = useHealthData()
  const { people: family } = useFamilyPeople()
  const writable = useWritableIds(member?.userId)
  const meds = useMedications(personId)
  const [takes, setTakes] = useState<MedTaken[]>(NONE)
  useEffect(() => {
    if (!personId) return setTakes(NONE)
    const since = new Date(Date.now() - 9 * 86_400_000).toISOString() // the pillbox looks back 7 days; two spare for time zones
    const sub = liveQuery(() => ldb.meds.where('personId').equals(personId).filter((t) => t.takenAt >= since).toArray()).subscribe({ next: setTakes, error: () => setTakes(NONE) })
    return () => sub.unsubscribe()
  }, [personId])
  const mine = !!personId && personId === ownId
  return (
    <>
      <SubHeader title={mine ? "My progress" : "Progress"} backHref="#health" backLabel="Back to Health" />
      <WhoLine />
      <div className="nu-stack" data-s="nudge-home">
        {mine && <Recap personId={personId} readings={readings} meds={meds} takes={takes} />}
        {personId && <Pillbox personId={personId} meds={meds} takes={takes} canMark={canMarkFor(personId, ownId, writable)} />}
        {personId && <Pixels personId={personId} readings={readings} />}
        <Kudos people={family} />
        {mine && <ReminderCard />}
      </div>
    </>
  )
}
