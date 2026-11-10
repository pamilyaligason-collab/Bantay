/** Weather-screen feature flags, kept per device (mirrors family/flags.ts). The blend is ON for everyone (Lloyd 2026-11-10, after S29): a phone turns it off with bantay.flag.wx.blend = '0' (Labs switch); no key, or storage refused, is on. */
export const wxFlag = (name: 'blend'): boolean => {
  try { return localStorage.getItem(`bantay.flag.wx.${name}`) !== '0' } catch { return true }
}
