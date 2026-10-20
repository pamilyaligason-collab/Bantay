import { describe, expect, it } from 'vitest'
import { bringList, nextVisitLine, visitList } from './visits'

const NOW = new Date(2026, 9, 20, 9, 0)
const at = (d: number, h = 9) => new Date(2026, 9, d, h, 0).toISOString()

describe('visit list', () => {
  const appts = [
    { clientId: 'a1', personId: 'p1', startsAt: at(29), provider: 'Dr. Reyes', facility: 'City Clinic', purpose: 'Check-up' },
    { clientId: 'a2', personId: 'p1', startsAt: at(25), purpose: 'Labs' },
    { clientId: 'a3', personId: 'p1', startsAt: at(2), apptStatus: 'done' as const, purpose: 'Old visit' },
    { clientId: 'a4', personId: 'p1', startsAt: at(27), apptStatus: 'cancelled' as const },
    { clientId: 'a5', personId: 'p2', startsAt: at(22) }
  ]
  it('next visit is the soonest planned one; cancelled and other people are left out; done ones are past', () => {
    const l = visitList(appts, [], 'p1', NOW)
    expect(l.next?.key).toBe('a2')
    expect(l.upcoming.map((v) => v.key)).toEqual(['a2', 'a1'])
    expect(l.past.map((v) => v.key)).toEqual(['a3'])
    expect(l.next?.sub).toBe('Sun 25 Oct 9:00 AM')
    expect(l.upcoming[1]!.sub).toBe('Thu 29 Oct 9:00 AM · Dr. Reyes, City Clinic')
  })
  it('a date-only appointment (due_on) shows without a time', () => {
    const l = visitList([{ clientId: 'd', personId: 'p1', dueOn: '2026-11-03' }], [], 'p1', NOW)
    expect(l.next).toMatchObject({ dateOnly: true, sub: 'Tue 3 Nov', title: 'Doctor visit' })
  })
  it('a follow-up shows as due only when no appointment covers it', () => {
    const rx = [
      { clientId: 'r1', serverId: 'rx1', personId: 'p1', followUpOn: '2026-11-10', prescriber: 'Dr. Reyes', status: 'confirmed' },
      { clientId: 'r2', serverId: 'rx2', personId: 'p1', followUpOn: '2026-10-29', status: 'confirmed' }, // same day as a1
      { clientId: 'r3', serverId: 'rx3', personId: 'p1', followUpOn: '2026-12-01', status: 'rejected' },
      { clientId: 'r4', serverId: 'rx4', personId: 'p2', followUpOn: '2026-11-11', status: 'confirmed' },
      { clientId: 'r5', serverId: 'rx5', personId: 'p1', followUpOn: '2026-12-05' }, // a draft prescription
      { clientId: 'r6', serverId: 'rx6', personId: 'p1', followUpOn: '2026-10-01', status: 'confirmed' } // already past
    ]
    const l = visitList([...appts, { clientId: 'a6', personId: 'p1', dueOn: '2026-11-01', sourcePrescriptionId: 'rx1' }], rx, 'p1', NOW)
    expect(l.followUps).toEqual([])
    const l2 = visitList(appts, rx, 'p1', NOW)
    expect(l2.followUps).toHaveLength(1)
    expect(l2.followUps[0]).toMatchObject({ kind: 'followup', title: 'Follow-up due', sub: "Tue 10 Nov · from Dr. Reyes's prescription" })
  })
  it('overview line: next visit, else follow-up, else nothing', () => {
    expect(nextVisitLine(visitList(appts, [], 'p1', NOW))).toEqual({ text: 'Next visit: Sun 25 Oct 9:00 AM', sub: 'Labs' })
    expect(nextVisitLine(visitList([], [{ personId: 'p1', followUpOn: '2026-11-10', status: 'confirmed' }], 'p1', NOW))).toEqual({ text: 'Follow-up due: Tue 10 Nov', sub: 'No visit booked yet' })
    expect(nextVisitLine(visitList([], [], 'p1', NOW))).toBeNull()
  })
  it('bring list: readings, medicines, papers, then questions', () => {
    expect(bringList({ hasReadings: true, questions: ['Is the LDL high?'] }).map((b) => b.id)).toEqual(['readings', 'meds', 'papers', 'q0'])
    expect(bringList({ hasReadings: false, questions: [] })[0]!.label).toMatch(/home readings/)
  })
})
