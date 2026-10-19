import { useTakenToday } from '../health/useActivity'
import { useSelfPersonId } from '../setup/useProfile'

/** Today's medicine takes logged for THIS phone's member only (sync also brings other family members' rows). Works offline: the self id falls back to the cached one. */
export const useMyTakes = () => useTakenToday(useSelfPersonId() ?? '')
