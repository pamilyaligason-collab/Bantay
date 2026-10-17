/** Same rule the admin-members function enforces: exactly 6 digits, not all one digit, not 123456. Returns an error message or null. */
export function pinError(pin: string): string | null {
  if (!/^[0-9]{6}$/.test(pin)) return 'The PIN must be exactly 6 digits.'
  if (/^(.)\1{5}$/.test(pin)) return 'Pick a PIN that is not one repeated digit.'
  if (pin === '123456') return 'Pick a PIN that is harder to guess.'
  return null
}

export const handleError = (h: string): string | null => (/^[a-z0-9._-]{3,24}$/.test(h) ? null : 'Handle is 3 to 24 letters, numbers, dot, dash or underscore.')
