import { db } from '../../db'

export const AI_KEY = 'privacy.ai' // kv: boolean, default true; false = Jack, photo reading and server reading of new scans are off
export const AI_OFF = 'AI is off. Turn it on in Me, Privacy.'

/** Every caller that would send text or a photo to the AI asks this first. Unreadable kv = default (on): the switch can only have been turned off through this same kv. */
export const aiOn = async (): Promise<boolean> => { try { return (await db.kv.get(AI_KEY))?.value !== false } catch { return true } }
