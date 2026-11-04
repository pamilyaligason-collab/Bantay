import { describe, expect, it } from 'vitest'
import care from './systemCare.json'
import content from './content.json'

interface Care { illnesses: string[]; emergency: string[]; doctor: string[]; prevention: string[]; sources: { name: string; url: string }[] }
const systems = care.systems as Record<string, Care>

describe('Body wiki care lists (A1)', () => {
  it('every system with a figure has emergency, doctor, illness and prevention lists and named sources', () => {
    for (const s of content.systems) {
      const c = systems[s.id]!
      expect(c, s.id).toBeTruthy()
      expect(c.emergency.length, s.id).toBeGreaterThanOrEqual(5)
      expect(c.doctor.length, s.id).toBeGreaterThanOrEqual(4)
      expect(c.illnesses.length).toBeGreaterThan(3)
      expect(c.prevention.length).toBeGreaterThan(2)
      expect(c.sources.length).toBeGreaterThan(0)
      for (const src of c.sources) expect(src.url).toMatch(/^https:\/\/medlineplus\.gov\/.+/)
    }
  })
  it('no dose, no wait-and-see, no home cure in any emergency or doctor line', () => {
    for (const c of Object.values(systems)) {
      for (const t of [...c.emergency, ...c.doctor]) {
        expect(t, t).not.toMatch(/\b\d+\s?(mg|ml|mcg|tablets?|pills?)\b/i)
        expect(t, t).not.toMatch(/\bwait\b|\bsee how\b|\bmonitor\b|\bsleep it off\b|\btry\b|for several days|does not go down|more than a few minutes/i)
      }
    }
  })
  it('the honest line stays, and every "reported" line exists in its system and has no DOH page among the sources', () => {
    expect(care.checked).toContain('A clinician has not signed them off')
    expect(care.reportedNote).toMatch(/not DOH pages/)
    for (const [id, c] of Object.entries(systems)) {
      const reported = (c as Care & { reported?: string[] }).reported ?? []
      for (const t of reported) expect([...c.emergency, ...c.doctor, ...c.prevention], `${id}: ${t}`).toContain(t)
      expect(c.sources.some((s) => /doh\.gov\.ph/.test(s.url)), id).toBe(false)
    }
  })
  it('the board lists are kept word for word and red-flag signs are present', () => {
    const d = systems.digestion!
    expect(d.emergency.slice(0, 2)).toEqual(['You vomit blood', 'Stools are black or bloody'])
    expect(d.doctor.slice(0, 2)).toEqual(['Yellow skin or eyes', 'Belly pain that does not go away'])
    expect(systems.heart!.emergency.join(' ')).toMatch(/Face drooping/)
    expect(systems.skin!.emergency.join(' ')).toMatch(/trouble breathing/)
  })
})

describe('Body wiki care lists: Opus review round 2 corrections', () => {
  const all = (k: 'emergency' | 'doctor' | 'prevention') => Object.entries(systems).flatMap(([id, c]) => c[k].map((t) => `${id}: ${t}`))
  it('the seizure sign says 2 minutes and includes a seizure unlike the usual ones; a stiff neck alone is not a 911 line', () => {
    const e = all('emergency').join('\n')
    expect(e).toContain('A seizure that lasts more than 2 minutes')
    expect(e).toContain("different from the person's usual ones")
    expect(e).not.toMatch(/\nbrain: A stiff neck, or/)
    expect(e).toContain('A sudden high fever with a severe headache or a stiff neck')
  })
  it('no emergency line makes sweating alone or a racing heart with fever alone a 911 sign', () => {
    const e = all('emergency').join('\n')
    expect(e).not.toMatch(/Chest pressure, sweating,/)
    expect(e).not.toMatch(/racing heart with confusion or fever/)
    expect(e).toContain('With an overactive thyroid: a racing heart')
  })
  it('breathing trouble that starts suddenly is a 911 sign, and vomiting with diabetes is not conditioned on fluids staying down', () => {
    const e = all('emergency').join('\n')
    expect(e).toContain('Trouble breathing that starts suddenly or is severe')
    expect(e).not.toMatch(/keeps fluids from staying down/)
  })
  it('every "drink water" prevention line carries the fluid-limit qualifier (heart and kidney illnesses are in this wiki)', () => {
    const lines = all('prevention').filter((t) => /drink (water|enough)/i.test(t))
    expect(lines.length).toBeGreaterThanOrEqual(2)
    for (const t of lines) expect(t).toContain('unless your doctor limits your fluids')
  })
  it('back pain at night is its own call-right-away line, apart from pain over 4 weeks', () => {
    const d = systems.skeleton!.doctor
    expect(d.some((t) => /wakes you at night.*see a doctor right away/.test(t))).toBe(true)
    expect(d).toContain('Back pain that lasts more than 4 weeks')
  })
  it('the floodwater 911 line is labelled as reported, and the added well-known signs are present', () => {
    const k = (care.systems as Record<string, { reported?: string[] }>).kidneys!.reported!
    expect(k.some((t) => /severe leptospirosis/.test(t))).toBe(true)
    expect(systems.heart!.emergency[0]).toBe('Someone collapses and does not respond, or is not breathing or is only gasping')
    expect(systems.skin!.emergency.join(' ')).toMatch(/heat stroke/)
    expect(systems.muscles!.emergency.join(' ')).toMatch(/Jaw stiffness/)
  })
})
