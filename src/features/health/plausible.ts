/** Plausibility bounds for a typed or device-read number (can this be a real reading?), not clinical rules. One list for the add sheet, the device reading and the server (mirrored in records-extract, tested equal). */
export const PLAUSIBLE = {
  bp: { min: 40, max: 300 },
  glucose: { min: 20, max: 800 },
  weight: { min: 2, max: 400 },
  pulse: { min: 20, max: 250 },
  temperature: { min: 30, max: 45 },
  spo2: { min: 50, max: 100 }
} as const
