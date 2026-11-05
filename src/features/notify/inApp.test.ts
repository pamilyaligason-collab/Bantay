import { describe, expect, it } from 'vitest'
import { JOBS } from '../admin/desk/systemApi'
import { inAppText, JOB_LABELS } from './inApp'

describe('inAppText system row', () => {
  it('uses the System health label for every known job and claims no more than one failed run', () => {
    for (const j of JOBS) {
      const t = inAppText({ template: 'system', ref: `${j.job}:81234` })
      expect(t.title).toBe(`${j.label} had a failed run`)
      expect(t.body).toBe('Open System health to see if it is still failing.')
    }
    expect(Object.keys(JOB_LABELS).sort()).toEqual(JOBS.map((j) => j.job).sort())
  })
  it('keeps the saved name for an unknown job', () => {
    expect(inAppText({ template: 'system', ref: 'new-job:1' }).title).toBe('new-job had a failed run')
  })
})
