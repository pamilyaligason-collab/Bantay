/** The family feed is off until lane P (posting + per-category sharing) ships; turn on per phone with localStorage bantay.flag.feed = '1'. */
export const familyFeedOn = (): boolean => { try { return localStorage.getItem('bantay.flag.feed') === '1' } catch { return false } }

/** The family place map and place sharing (D-136, D-138, migration 0052) stay off until the phone check; turn on per phone with localStorage bantay.flag.places = 1. */
export const familyPlacesOn = (): boolean => { try { return localStorage.getItem('bantay.flag.places') === '1' } catch { return false } }
