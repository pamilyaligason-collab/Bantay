/** The family feed is off until lane P (posting + per-category sharing) ships; turn on per phone with localStorage bantay.flag.feed = '1'. */
export const familyFeedOn = (): boolean => { try { return localStorage.getItem('bantay.flag.feed') === '1' } catch { return false } }
