import { Capacitor, registerPlugin } from '@capacitor/core'

/** Native plugin (built in android/, lane L2): opens the phone's contact list and returns one name and number. */
export const ContactPicker = registerPlugin<{ pick(): Promise<{ name: string; phone: string }> }>('ContactPicker')

export const canPickContact = () => Capacitor.isNativePlatform()

/** Never rejects. null = cancelled, unavailable, or no usable number. */
export async function pickContact(): Promise<{ name: string; phone: string } | null> {
  try {
    const r = await ContactPicker.pick()
    const name = typeof r?.name === 'string' ? r.name.trim().slice(0, 60) : ''
    const phone = typeof r?.phone === 'string' ? r.phone.trim().slice(0, 20) : ''
    return phone ? { name, phone } : null
  } catch { return null }
}
