import { useMedications } from '../health/useMedications'
import { useTakenToday, type TakenToday } from '../health/useActivity'
import type { MedTaken } from '../log/store'
import { useSelfPersonId } from '../setup/useProfile'
import { useActingPersonId } from '../viewas/viewAs'

/** A take as stored: id-based matching uses medicationId + slot; rows from before M1 only have a name. */
export type MyTake = TakenToday & Partial<Pick<MedTaken, 'medicationId' | 'slot' | 'skipped'>>

/** Today's medicine takes (skipped doses are NOT takes and are left out) logged for the SIGNED-IN person only (sync also brings other family members' rows). Works offline: the self id falls back to the cached one.
 *  Always the signed-in person, never the acting one (D-99): its consumer useInbox builds the bell from the admin's own medicines, so mixing in Mama's takes would show the admin's doses as missed.
 *  Only the two hooks below follow the acting member, for the screens that draw and write for them (QuickLog). */
export const useMyTakes = (): MyTake[] => useTakenToday(useSelfPersonId() ?? '') as MyTake[]

/** The ACTING member's takes (me when not acting), skipped rows included, for the id-based dose screens that show Skipped (matchDoses reads `skipped`). Callers must write with the same id (useActingPersonId). */
export const useMyDoseRows = (): MyTake[] => useTakenToday(useActingPersonId() ?? '', { includeSkipped: true }) as MyTake[]

/** The ACTING member's medications rows (me when not acting; the live schedule). Callers must write with the same id (useActingPersonId). */
export const useMyMedications = () => useMedications(useActingPersonId() ?? '')
