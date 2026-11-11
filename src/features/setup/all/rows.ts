import type { NotifyState } from '../steps'

/** The Set up everything checklist (#setup/all): pure ordering and status. Reading the phone is facts.ts; doing a step is actions.ts. */
export type RowId = 'update' | 'notifications' | 'exact' | 'battery' | 'autostart' | 'bg' | 'location' | 'health' | 'library' | 'maps' | 'test'
/** done = nothing to do; tap = one button does it; na = this phone cannot (shown, never faked as done). */
export type RowStatus = 'done' | 'tap' | 'na'

export const ORDER: RowId[] = ['update', 'notifications', 'exact', 'battery', 'autostart', 'bg', 'location', 'health', 'library', 'maps', 'test']

export interface UpdateFact {
  kind: 'none' | 'ready' | 'required'
  versionName: string
  sizeMB: number
  /** Android lets Bantay install updates (the once-only "Install unknown apps" switch). null = not asked yet. */
  canInstall: boolean | null
  phase: 'idle' | 'waiting_wifi' | 'downloading' | 'pending' | 'error'
  pct: number
}
export interface Facts {
  /** The Android app. Web shows only the rows that apply there. */
  native: boolean
  /** null = web, or the app has not answered yet: no update row. */
  update: UpdateFact | null
  notifSupported: boolean
  notif: NotifyState
  location: 'granted' | 'ask' | 'denied' | 'unsupported'
  health: 'on' | 'off' | 'unavailable'
  /** none = the library is not hosted in this build. */
  library: 'on' | 'off' | 'none'
  libraryMB: number
  /** none = offline maps switched off in this build. */
  maps: 'on' | 'off' | 'none'
  testSent: boolean
  /** Day the test reminder was last sent (kept across visits), or null. */
  testDate?: string | null
  /** Family places switch (Labs): whether the place can be shared with family at all. Decides the location row's privacy line. */
  familyPlaces?: boolean
  /** Autostart: none = this maker has no such switch; off/done = opened it (Android cannot read it back, so Bantay keeps the day the person opened it). */
  autostart?: 'none' | 'off' | 'done'
  /** The daily check-in while the app is closed: none = not available or not allowed for this person, on = armed, off = allowed but not armed. */
  bg?: 'none' | 'on' | 'off'
}
export interface Row {
  id: RowId
  title: string
  /** What the phone will ask, in plain words. */
  say: string
  status: RowStatus
  button: string
  /** The button cannot be used yet (a download is running, or the step before it is not done). */
  disabled?: boolean
  /** Do all leaves this one for its own tap (a large download, or a switch Bantay cannot read back). */
  manual?: boolean
}

function updateRow(u: UpdateFact): Row {
  const title = 'Update Bantay'
  if (u.kind === 'none') return { id: 'update', title, say: 'You have the latest Bantay.', status: 'done', button: 'Check again' }
  const what = `Bantay ${u.versionName} is ready (${u.sizeMB} MB).`
  if (u.canInstall === false) return { id: 'update', title, say: `${what} Android first asks once to let Bantay install updates: tap Open Settings, turn on Allow, then go Back.`, status: 'tap', button: 'Open Settings' }
  if (u.phase === 'downloading') return { id: 'update', title, say: `Downloading ${u.pct}%. You can leave this screen; it keeps going.`, status: 'tap', button: `Downloading ${u.pct}%`, disabled: true }
  if (u.phase === 'pending') return { id: 'update', title, say: "Android shows its own box. Tap Update in it. Bantay restarts when it is done.", status: 'tap', button: 'Waiting for you', disabled: true }
  if (u.phase === 'waiting_wifi') return { id: 'update', title, say: `${what} Waiting for Wi-Fi; it starts by itself when you connect.`, status: 'tap', button: 'Waiting for Wi-Fi', disabled: true }
  if (u.phase === 'error') return { id: 'update', title, say: `${what} The last try did not finish. Nothing was lost.`, status: 'tap', button: 'Try again' }
  return { id: 'update', title, say: `${what} Bantay downloads it, then Android asks you to tap Install.`, status: 'tap', button: 'Get the update' }
}

/** The rows that apply on this phone, in the order the steps should be done (the update first: installing it restarts the app). */
export function buildRows(f: Facts): Row[] {
  const rows: Row[] = []
  const add = (r: Row) => rows.push(r)
  if (f.native && f.update) add(updateRow(f.update))

  if (!f.notifSupported) add({ id: 'notifications', title: 'Reminders and alerts', say: 'This browser cannot show notifications. The Android app can.', status: 'na', button: 'Not available' })
  else if (f.notif.display) add({ id: 'notifications', title: 'Reminders and alerts', say: 'Notifications are on.', status: 'done', button: 'Done' })
  else add({ id: 'notifications', title: 'Reminders and alerts', say: f.native ? 'Android asks: allow Bantay to send notifications? Tap Allow.' : 'Your browser asks to allow notifications. Tap Allow.', status: 'tap', button: 'Turn on' })

  if (f.native) {
    add(f.notif.exact
      ? { id: 'exact', title: 'Alarms on time', say: 'Medicine alarms ring on time.', status: 'done', button: 'Done' }
      : { id: 'exact', title: 'Alarms on time', say: 'Android opens Alarms and reminders. Turn on Bantay, then go Back.', status: 'tap', button: 'Open the switch' })
    add(f.notif.battery
      ? { id: 'battery', title: 'Keep running in the background', say: 'Bantay may run while the screen is off.', status: 'done', button: 'Done' }
      : { id: 'battery', title: 'Keep running in the background', say: 'Android asks: let Bantay run in the background? Tap Allow. Otherwise a medicine alarm can be late.', status: 'tap', button: 'Allow' })
  }

  if (f.native && f.autostart && f.autostart !== 'none') {
    add(f.autostart === 'done'
      ? { id: 'autostart', title: 'Autostart', say: 'You opened the Autostart switch. Bantay cannot see it from here; open it again if an alarm is ever late.', status: 'done', button: 'Open again', manual: true }
      : { id: 'autostart', title: 'Autostart', say: 'Your phone has a separate Autostart switch. Settings opens: turn Autostart on for Bantay, then go Back.', status: 'tap', button: 'Open the switch', manual: true })
  }
  if (f.native && f.bg && f.bg !== 'none') {
    add(f.bg === 'on'
      ? { id: 'bg', title: 'Daily check-in', say: 'Bantay tells family the phone is on and its battery once a day, even when the app is closed. No place is sent.', status: 'done', button: 'Done' }
      : { id: 'bg', title: 'Daily check-in', say: 'Lets Bantay tell family once a day that the phone is on and its battery, even when the app is closed. No place is sent. Nothing is asked.', status: 'tap', button: 'Turn on' })
  }

  if (f.location === 'unsupported') add({ id: 'location', title: 'Where you are', say: 'This phone cannot share its location with Bantay.', status: 'na', button: 'Not available' })
  else if (f.location === 'granted') add({ id: 'location', title: 'Where you are', say: 'Weather and quake warnings follow your place.', status: 'done', button: 'Done' })
  else if (f.location === 'denied') add({ id: 'location', title: 'Where you are', say: 'Location is off for Bantay. Settings opens: tap Permissions, then Location, then While using the app.', status: 'tap', button: 'Open Settings' })
  else {
    const ask = f.native ? 'Android asks for your location. Choose While using the app.' : 'Your phone asks for your location.'
    add({ id: 'location', title: 'Where you are', say: `${ask} It is used for weather and quake warnings and stays on this phone${f.familyPlaces ? ' unless you share it with family' : ''}.`, status: 'tap', button: 'Share my location' })
  }

  if (f.native) {
    if (f.health === 'unavailable') add({ id: 'health', title: 'Phone health data', say: 'Health Connect is not on this phone, so steps, sleep and heart rate cannot be read.', status: 'na', button: 'Not available' })
    else if (f.health === 'on') add({ id: 'health', title: 'Phone health data', say: 'Bantay reads your steps, sleep, heart rate and blood pressure from Health Connect.', status: 'done', button: 'Done' })
    else add({ id: 'health', title: 'Phone health data', say: 'Health Connect opens. Tick steps, sleep, heart rate and blood pressure, then tap Allow. Bantay only reads them.', status: 'tap', button: 'Connect' })
  }

  if (f.library !== 'none') {
    add(f.library === 'on'
      ? { id: 'library', title: 'Medical library on this phone', say: 'It downloads on Wi-Fi only, so it works without signal.', status: 'done', button: 'Done' }
      : { id: 'library', title: 'Medical library on this phone', say: `Saves the medical library (about ${f.libraryMB} MB) on this phone. Only on Wi-Fi, never on mobile data. Nothing is asked.`, status: 'tap', button: 'Download on Wi-Fi', manual: true })
  }
  if (f.maps !== 'none') {
    add(f.maps === 'on'
      ? { id: 'maps', title: 'Offline maps', say: 'Maps of your area download on Wi-Fi.', status: 'done', button: 'Done' }
      : { id: 'maps', title: 'Offline maps', say: 'Saves a map of your area on this phone, only on Wi-Fi, so it works without signal. Nothing is asked.', status: 'tap', button: 'Download on Wi-Fi' })
  }

  if (f.native) {
    const ready = f.notif.display
    add(f.testSent
      ? { id: 'test', title: 'Send a test reminder', say: f.testDate ? `Sent on ${f.testDate}. Look for the notification. If you see it, reminders work on this phone.` : 'Look for the notification. If you see it, reminders work on this phone.', status: 'done', button: 'Send again' }
      : { id: 'test', title: 'Send a test reminder', say: ready ? 'Bantay shows a reminder in 5 seconds. Nothing is asked.' : 'Turn on reminders first, then send the test.', status: 'tap', button: 'Send in 5 seconds', disabled: !ready })
  }
  return rows.sort((a, b) => ORDER.indexOf(a.id) - ORDER.indexOf(b.id))
}

export const rowsLeft = (rows: Row[]) => rows.filter((r) => r.status === 'tap')
/** What Do all would still run: the rows left minus those it leaves for the person's own tap. */
export const doAllLeft = (rows: Row[]) => rowsLeft(rows).filter((r) => !r.manual)
/** All set = nothing is waiting for a tap. A row this phone cannot do does not block it. */
export const allSet = (rows: Row[]) => rows.length > 0 && rowsLeft(rows).length === 0

/** "Do all": the first step that needs a tap runs; when it is done the next one runs. It stops at a step that is still waiting on the person (an OS prompt or settings switch).
 *  A step that carries on by itself (the update download) is passed over so the rest still run. A step whose button is disabled is not run yet, and a manual step is never run.
 *  Returns the step it stopped at, or null when nothing is left for it to do. `read` re-reads the phone after each step. */
export async function walk(rows: Row[], read: () => Promise<Row[]>, act: (id: RowId) => Promise<void>): Promise<RowId | null> {
  let cur = rows
  const passed = new Set<RowId>()
  for (let guard = 0; guard < ORDER.length; guard++) {
    const next = cur.find((r) => r.status === 'tap' && !r.disabled && !passed.has(r.id) && !r.manual)
    if (!next) return null
    await act(next.id)
    cur = await read()
    const after = cur.find((r) => r.id === next.id)
    if (after && after.status === 'tap') {
      if (!after.disabled) return next.id // still waiting for the person
      passed.add(next.id) // running by itself
    }
  }
  return null
}
