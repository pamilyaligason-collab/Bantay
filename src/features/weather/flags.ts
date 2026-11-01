/** Weather-screen feature flags, off by default and kept per device (mirrors family/flags.ts). */
export const wxFlag = (name: 'blend'): boolean => {
  try { return localStorage.getItem(`bantay.flag.wx.${name}`) === '1' } catch { return false }
}
