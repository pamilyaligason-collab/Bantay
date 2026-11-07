/** The family feed is off until lane P (posting + per-category sharing) ships; turn on per phone with localStorage bantay.flag.feed = '1'. */
export const familyFeedOn = (): boolean => { try { return localStorage.getItem('bantay.flag.feed') === '1' } catch { return false } }

/** The family place map and place sharing (D-136, D-138, migration 0052) are ON for everyone (D-143); a phone turns them off with localStorage bantay.flag.places = 0 (Labs switch). Sending still waits for each person's notice answer and switch. */
export const familyPlacesOn = (): boolean => { try { return localStorage.getItem('bantay.flag.places') !== '0' } catch { return true } }
