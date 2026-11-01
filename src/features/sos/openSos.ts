/** A hold finished away from the Jack sheet (the warning card's button): ask the one SOS screen owner (JackFab, mounted at App level outside ScreenBoundary) to open it,
 *  so an alert change, a hash change or a screen error can never unmount a running SOS. */
export const OPEN_SOS_EVENT = 'sos:open'
export const openSos = () => window.dispatchEvent(new Event(OPEN_SOS_EVENT))
