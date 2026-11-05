import type { Alert } from '../safety/alerts'
import { cyclones } from '../safety/LiveMaps'
import { liveSignals } from '../safety/stormMode'

/** D-125: the storm map and rows show only while GDACS lists a storm or a PAGASA wind signal is live. A stale or empty feed is not an advisory (the one line card says "not checked lately"). */
export const hasAdvisory = (alerts: Alert[], now: number = Date.now()): boolean => cyclones(alerts).length > 0 || liveSignals(alerts, now).length > 0
