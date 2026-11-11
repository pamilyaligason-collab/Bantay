import { Capacitor } from '@capacitor/core'
import { App } from '@capacitor/app'

/** The /get page opens the installed app with this address (intent://setup). A sibling of nativeOAuth's auth-callback listener; it never touches the sign-in branch. */
export const SETUP_LINK = 'ph.bantay.family://setup'
export const SETUP_HASH = '#setup/all'

/** The in-app route for a deep link, or null for any other address (the sign-in return, a stranger's link, a look-alike host such as setupx). */
export function setupRoute(url: string): string | null {
  if (!url.startsWith(SETUP_LINK) || !/^([?#/]|$)/.test(url.slice(SETUP_LINK.length))) return null
  return SETUP_HASH
}

const go = (url: string | undefined) => {
  const h = url ? setupRoute(url) : null
  if (h && location.hash !== h) location.hash = h
}

// The app may be started by the link (cold start) or already open (singleTask delivers a new intent): listen for both.
if (Capacitor.isNativePlatform()) {
  void Promise.resolve(App.addListener('appUrlOpen', ({ url }) => go(url))).catch(() => undefined) // no app plugin in this shell: the rest of the app still runs
  void Promise.resolve(App.getLaunchUrl()).then((r) => go(r?.url)).catch(() => undefined)
}
