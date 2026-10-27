import { Capacitor, registerPlugin } from '@capacitor/core'
import type { SosContact } from './contacts'
import { usableNumber, smsNumber } from './sms'

export type CallPermission = 'granted' | 'denied' | 'unavailable'
interface CallNative {
  call(o: { number: string }): Promise<{ placed: boolean }>
  checkPermission(): Promise<{ state: 'granted' | 'denied' }>
  requestPermission(): Promise<{ state: 'granted' | 'denied' }>
}
const Call = registerPlugin<CallNative>('Call')

// shortcut: the shell helper hasPlugin('Call') (S1, src/native/shell.ts) is not in this branch yet; swap this line for it after S1 merges.
const hasCall = () => Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('Call')
const dial = (number: string) => { window.location.href = `tel:${number}` }

/** 'unavailable' on the web, an old shell or no Call plugin. Never prompts. */
export async function callPermission(): Promise<CallPermission> {
  if (!hasCall()) return 'unavailable'
  try { return (await Call.checkPermission()).state } catch { return 'unavailable' }
}

/** The ONLY place that prompts: setup (SOS-contacts card) and the Me row call it, the SOS flow never does. */
export async function requestCallPermission(): Promise<CallPermission> {
  if (!hasCall()) return 'unavailable'
  try { return (await Call.requestPermission()).state } catch { return 'unavailable' }
}

/** native CallPlugin first; 'tel' = the prefilled dial screen (permission missing, PWA, old shell, no plugin, native refusal); 'none' = no contact with a number.
 *  911 is never auto-dialled: opts.emergency always opens the 'tel:911' dial screen. */
export async function callFirstContact(contacts: SosContact[], opts?: { emergency?: boolean }): Promise<{ placed: boolean; via: 'native' | 'tel' | 'none' }> {
  if (opts?.emergency) { dial('911'); return { placed: false, via: 'tel' } }
  const c = contacts.find((x) => usableNumber(x.phone))
  if (!c) return { placed: false, via: 'none' }
  const number = smsNumber(c.phone)
  if ((await callPermission()) === 'granted') {
    try { if ((await Call.call({ number })).placed) return { placed: true, via: 'native' } } catch { /* fall back to the dial screen */ }
  }
  dial(number)
  return { placed: false, via: 'tel' }
}
