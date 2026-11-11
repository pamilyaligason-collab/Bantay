import { useSyncExternalStore } from 'react'
import { subscribeZones, zoneOf } from './zone'

/** The zone a person's clock runs on, live: re-renders when people.tz arrives or this phone's zone is set (the string is its own snapshot). */
export const usePersonZone = (personId: string | null | undefined): string => useSyncExternalStore(subscribeZones, () => zoneOf(personId), () => zoneOf(personId))
