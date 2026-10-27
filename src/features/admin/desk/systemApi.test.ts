import { describe, expect, it } from 'vitest'
import {
  ALERT_KINDS, dayRates, errorTotals, errorsByVersion, errorsNote, errorsTone, JOB_STALE_MIN, jobStatus, KNOWN_MIGRATIONS, lowestDay, phoneStatus, seenLine, seenRate, seenTone,
  sortPhones, unseenList, type AlertStats, type ErrRow, type PhoneRow
} from './systemApi'

const NOW = Date.parse('2026-10-26T01:00:00Z') // 9:00 AM in Manila
const min = (m: number) => new Date(NOW - m * 60_000).toISOString()
const hr = (h: number) => new Date(NOW - h * 3_600_000).toISOString()

describe('job status (red when failed or older than 30 minutes)', () => {
  it('is fine for a recent good run and exactly at the 30-minute edge', () => {
    expect(JOB_STALE_MIN).toBe(30)
    expect(jobStatus({ job: 'dose-watch', ran_at: min(10), ok: true }, NOW)).toMatchObject({ tone: 'ok' })
    expect(jobStatus({ job: 'dose-watch', ran_at: min(10), ok: true }, NOW).text).toMatch(/8:50/)
    expect(jobStatus({ job: 'dose-watch', ran_at: min(30), ok: true }, NOW).tone).toBe('ok')
  })
  it('is red at 31 minutes, and when the last run failed even if it was just now', () => {
    const stale = jobStatus({ job: 'dose-watch', ran_at: min(31), ok: true }, NOW)
    expect(stale.tone).toBe('bad'); expect(stale.text).toMatch(/Stopped/)
    const failed = jobStatus({ job: 'dose-watch', ran_at: min(1), ok: false }, NOW)
    expect(failed.tone).toBe('bad'); expect(failed.text).toMatch(/Failed 8:59/)
  })
  it('never ran or unreadable time is amber (unknown), not red', () => {
    expect(jobStatus(null, NOW).tone).toBe('warn')
    expect(jobStatus(undefined, NOW).tone).toBe('warn')
    expect(jobStatus({ job: 'x', ran_at: 'not a time', ok: true }, NOW).tone).toBe('warn')
  })
})

const phone = (o: Partial<PhoneRow> = {}): PhoneRow => ({
  user_id: 'u', platform: 'android', app_version: '2.3.0', alarms_ok: true, notif_ok: true, exact_ok: true, battery_ok: true, call_ok: true, oem: null,
  last_open_at: hr(1), alarms_checked_at: min(30), ...o
})

describe('phone alarm status', () => {
  it('green when the alarm check passes and the phone was opened recently', () => {
    const s = phoneStatus(phone(), NOW)
    expect(s.tone).toBe('ok'); expect(s.text).toMatch(/^Alarms on, last checked 8:30/)
  })
  it('red when alarms are not ok, with the reason by priority: battery, exact, notifications, then a generic re-check', () => {
    expect(phoneStatus(phone({ alarms_ok: false, battery_ok: false, oem: 'Xiaomi' }), NOW)).toMatchObject({ tone: 'bad', text: 'Xiaomi battery saver is on, alarms will be late. Turn it off for Bantay' })
    expect(phoneStatus(phone({ alarms_ok: false, exact_ok: false }), NOW)).toMatchObject({ tone: 'bad', text: 'Exact alarms are off. Allow them in Settings' })
    expect(phoneStatus(phone({ alarms_ok: false, notif_ok: false }), NOW)).toMatchObject({ tone: 'bad', text: 'Notifications are off. Turn them on in Settings' })
    expect(phoneStatus(phone({ alarms_ok: false }), NOW)).toMatchObject({ tone: 'bad', text: 'Alarms may not ring. Open Bantay on that phone to re-check' })
  })
  it('amber when alarms are ok but a setting could delay them', () => {
    expect(phoneStatus(phone({ battery_ok: false, oem: 'Xiaomi' }), NOW)).toMatchObject({ tone: 'warn', text: 'Xiaomi battery saver is on, may delay alarms' })
    expect(phoneStatus(phone({ exact_ok: false }), NOW).tone).toBe('warn')
    expect(phoneStatus(phone({ notif_ok: false }), NOW).tone).toBe('warn')
  })
  it('an old app (alarms_ok null) is amber; unknown settings are not problems (ML-05)', () => {
    expect(phoneStatus(phone({ alarms_ok: null }), NOW)).toMatchObject({ tone: 'warn', text: expect.stringMatching(/^Old app/) })
    expect(phoneStatus(phone({ battery_ok: null, exact_ok: null, notif_ok: null, last_open_at: null, alarms_checked_at: null }), NOW)).toMatchObject({ tone: 'ok', text: 'Alarms on' })
  })
  it('not opened for more than 48 hours turns green amber and says how many days; 47 hours does not', () => {
    expect(phoneStatus(phone({ last_open_at: hr(47) }), NOW).tone).toBe('ok')
    const s = phoneStatus(phone({ last_open_at: hr(80) }), NOW) // 80 h = 3 whole days
    expect(s.tone).toBe('warn'); expect(s.text).toMatch(/ · not opened for 3 days$/)
    expect(phoneStatus(phone({ last_open_at: hr(49) }), NOW).text).toMatch(/not opened for 2 days$/) // 49 h, whole days rounded down
  })
  it('the idle note never softens a red row', () => {
    expect(phoneStatus(phone({ alarms_ok: false, last_open_at: hr(100) }), NOW).tone).toBe('bad')
  })
  it('the browser app is amber with the no-alarms note, and says it waits until opened', () => {
    const s = phoneStatus(phone({ platform: 'web', alarms_ok: null, last_open_at: hr(24 * 9) }), NOW)
    expect(s.tone).toBe('warn'); expect(s.text).toBe('Browser app: no alarms · alerts wait until it is opened · not opened for 9 days')
  })
  it('sorts problems first, then amber, then fine, then by name', () => {
    const rows = [{ tone: 'ok', name: 'Ate' }, { tone: 'warn', name: 'Zed' }, { tone: 'bad', name: 'Mama' }, { tone: 'warn', name: 'Ben' }, { tone: 'ok', name: 'Abe' }] as const
    expect(sortPhones([...rows]).map((r) => r.name)).toEqual(['Mama', 'Ben', 'Zed', 'Abe', 'Ate'])
  })
})

const e = (day: string, count: number, hash: string, version: string | null, where_ = 'window.onerror'): ErrRow => ({ where_, message_hash: hash, app_version: version, count, day })

describe('client errors', () => {
  const rows = [
    e('2026-10-26', 3, 'a', '2.3.0'), e('2026-10-25', 2, 'a', '2.3.0'), e('2026-10-25', 1, 'b', '2.3.0'),
    e('2026-10-20', 1, 'c', '2.2.0'), e('2026-10-19', 9, 'c', '2.2.0'), e('2026-10-26', 4, 'd', null)
  ]
  it('groups the last 7 Manila days by version, most errors first; older rows and null versions handled', () => {
    expect(errorsByVersion(rows, '2026-10-26')).toEqual([
      { version: '2.3.0', errors: 6, kinds: 2 },
      { version: 'unknown', errors: 4, kinds: 1 },
      { version: '2.2.0', errors: 1, kinds: 1 } // 20 Oct is day 7; 19 Oct (9 errors) is outside
    ])
  })
  it('totals today and yesterday, with the amber rule and the words', () => {
    const t = errorTotals(rows, '2026-10-26')
    expect(t).toEqual({ today: 7, yesterday: 3 })
    expect(errorsTone(t)).toBe('warn'); expect(errorsNote(t)).toBe('4 more than yesterday')
    expect(errorsTone({ today: 3, yesterday: 3 })).toBe('plain'); expect(errorsNote({ today: 3, yesterday: 3 })).toBe('same as yesterday')
    expect(errorsTone({ today: 0, yesterday: 5 })).toBe('plain'); expect(errorsNote({ today: 0, yesterday: 5 })).toBe('5 fewer than yesterday')
    expect(errorsTone({ today: 1, yesterday: 0 })).toBe('warn')
  })
})

const stats = (o: Partial<AlertStats> = {}): AlertStats => ({ sent: 80, due_1h: 74, seen: 76, seen_1h: 71, unseen_by_kind: {}, by_day: [], ...o })

describe('alert reach', () => {
  it('seen rate: 71 of 74 is 96 percent; nothing due or unknown is null, never 0', () => {
    expect(seenRate(stats())).toBe(96)
    expect(seenRate(stats({ due_1h: 3, seen_1h: 1 }))).toBe(33)
    expect(seenRate(stats({ due_1h: 0, seen_1h: 0 }))).toBeNull()
    expect(seenRate(null)).toBeNull(); expect(seenRate(undefined)).toBeNull()
  })
  it('tone: 90 and up fine, 70 to 89 amber, under 70 red, unknown plain', () => {
    expect([100, 90, 89, 70, 69, 0].map((r) => seenTone(r))).toEqual(['ok', 'ok', 'warn', 'warn', 'bad', 'bad'])
    expect(seenTone(null)).toBe('plain')
  })
  it('unseen list: labels, biggest first, zero dropped, an unknown kind shown as is', () => {
    expect(unseenList(stats({ unseen_by_kind: { system: 2, hazard: 1, dose_missed: 0, weird_kind: 3 } }))).toEqual([
      { kind: 'weird_kind', label: 'weird_kind', n: 3 }, { kind: 'system', label: 'System problems', n: 2 }, { kind: 'hazard', label: 'Storm and hazard warnings', n: 1 }
    ])
    expect(unseenList(null)).toEqual([])
  })
  it('has a label for every carer_alerts.kind in the contract (ML-28)', () => {
    expect(Object.keys(ALERT_KINDS).sort()).toEqual(['digest', 'dose_missed', 'hazard', 'mood_unwell', 'phone_health', 'pin_approve', 'pin_changed', 'reading_high', 'review_open', 'rollcall', 'share', 'kudos', 'sos', 'sos_cancel', 'system'].sort())
  })
  it('per-day rates are sorted, a day with no due alerts is null, and the lowest day is found', () => {
    const r = dayRates(stats({ by_day: [{ day: '2026-10-24', total: 7, seen_1h: 5 }, { day: '2026-10-22', total: 10, seen_1h: 10 }, { day: '2026-10-23', total: 0, seen_1h: 0 }] }))
    expect(r).toEqual([{ day: '2026-10-22', total: 10, rate: 100 }, { day: '2026-10-23', total: 0, rate: null }, { day: '2026-10-24', total: 7, rate: 71 }])
    expect(lowestDay(r)).toEqual({ day: '2026-10-24', rate: 71 })
    expect(lowestDay([{ day: 'x', rate: null }])).toBeNull()
    expect(dayRates(null)).toEqual([])
  })
  it('the dashboard line: percent and counts, the unopened total, too new, none sent, unknown hidden', () => {
    expect(seenLine(null)).toBeNull()
    expect(seenLine(stats({ unseen_by_kind: { hazard: 1, system: 2 } }))).toEqual({ tone: 'ok', text: '96% of alerts opened within 1 hour (71 of 74), last 7 days · 3 not opened yet' })
    expect(seenLine(stats({ due_1h: 10, seen_1h: 7 }))).toEqual({ tone: 'warn', text: '70% of alerts opened within 1 hour (7 of 10), last 7 days' })
    expect(seenLine(stats({ sent: 2, due_1h: 0, seen_1h: 0, unseen_by_kind: { dose_missed: 2 } }))).toEqual({ tone: 'plain', text: '2 alerts sent, too new to judge · 2 not opened yet' })
    expect(seenLine(stats({ sent: 0, due_1h: 0, seen_1h: 0 }))).toEqual({ tone: 'plain', text: 'No alerts were sent in the last 7 days.' })
  })
})

describe('migrations.json', () => {
  const files = Object.keys(import.meta.glob('../../../../supabase/migrations/*.sql')).map((p) => p.split('/').pop()!).filter((f) => !f.endsWith('.down.sql')).map((f) => f.slice(0, 4))
  it('is sorted, has no duplicates, skips 0028 and ends with the range 0033 to 0040', () => {
    expect([...KNOWN_MIGRATIONS].sort()).toEqual(KNOWN_MIGRATIONS)
    expect(new Set(KNOWN_MIGRATIONS).size).toBe(KNOWN_MIGRATIONS.length)
    expect(KNOWN_MIGRATIONS).not.toContain('0028')
    expect(KNOWN_MIGRATIONS.slice(-8)).toEqual(['0033', '0034', '0035', '0036', '0037', '0038', '0039', '0040'])
    expect(KNOWN_MIGRATIONS.every((v) => /^\d{4}$/.test(v))).toBe(true)
  })
  it('lists every migration file in the repo, so a new file cannot be forgotten', () => {
    expect(files.length).toBeGreaterThan(20)
    expect(files.filter((v) => !KNOWN_MIGRATIONS.includes(v))).toEqual([])
  })
  it('has no gap except 0028 up to the last number', () => {
    const all = Array.from({ length: 40 }, (_, i) => String(i + 1).padStart(4, '0')).filter((v) => v !== '0028')
    expect(KNOWN_MIGRATIONS).toEqual(all)
  })
})
