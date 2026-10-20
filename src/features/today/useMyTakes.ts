import { useMedications } from '../health/useMedications'
import { useTakenToday, type TakenToday } from '../health/useActivity'
import type { MedTaken } from '../log/store'
import { useSelfPersonId } from '../setup/useProfile'

/** A take as stored: id-based matching uses medicationId + slot; rows from before M1 only have a name. */
export type MyTake = TakenToday & Partial<Pick<MedTaken, 'medicationId' | 'slot' | 'skipped'>>

/** Today's medicine takes (and skips) logged for THIS phone's member only (sync also brings other family members' rows). Works offline: the self id falls back to the cached one. */
export const useMyTakes = (): MyTake[] => useTakenToday(useSelfPersonId() ?? '') as MyTake[]

/** This phone's member's medications rows (the live schedule). */
export const useMyMedications = () => useMedications(useSelfPersonId() ?? '')
