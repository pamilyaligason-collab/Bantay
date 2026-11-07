import { describe, expect, it } from 'vitest'
import { goalGlasses, waterGoal, waterGoalMl } from './waterGoal'

describe('waterGoal (D-144)', () => {
  it('adult women, men and unknown sex without a weight', () => {
    expect(waterGoal({ sex: 'female', ageYears: 70 })).toEqual({ ml: 1600, glasses: 6, source: 'sex' })
    expect(waterGoal({ sex: 'male' })).toEqual({ ml: 2000, glasses: 8, source: 'sex' })
    expect(waterGoal({})).toEqual({ ml: 1800, glasses: 7, source: 'default' })
    expect(waterGoalMl({ sex: null, weightKg: null, ageYears: null })).toBe(1800)
  })
  it('weight wins over sex: 30 ml per kg bounded to 1500..3000', () => {
    expect(waterGoal({ sex: 'male', weightKg: 50 })).toEqual({ ml: 1500, glasses: 6, source: 'weight' })
    expect(waterGoal({ sex: 'female', weightKg: 80 })).toEqual({ ml: 2400, glasses: 10, source: 'weight' })
    expect(waterGoal({ weightKg: 120 })).toEqual({ ml: 3000, glasses: 12, source: 'weight' })
    expect(waterGoalMl({ weightKg: 65 })).toBe(1950)
  })
  it('a zero or negative weight is unknown, not a weight', () => {
    expect(waterGoal({ weightKg: 0 })!.source).toBe('default')
    expect(waterGoal({ weightKg: -5, sex: 'female' })!.ml).toBe(1600)
  })
  it('children under 14 use the EFSA child values scaled to drinks, never the weight rule', () => {
    expect(waterGoalMl({ ageYears: 2 })).toBe(1040)
    expect(waterGoalMl({ ageYears: 6, weightKg: 20 })).toBe(1280)
    expect(waterGoalMl({ ageYears: 10, sex: 'female' })).toBe(1520)
    expect(waterGoalMl({ ageYears: 10, sex: 'male' })).toBe(1680)
    expect(waterGoal({ ageYears: 13 })!.source).toBe('child')
    expect(waterGoal({ ageYears: 14, sex: 'female' })!.source).toBe('sex')
  })
  it("a doctor's fluid limit caps the goal and says so; a limit above the goal changes nothing", () => {
    expect(waterGoal({ sex: 'male', fluidLimitMl: 1500 })).toEqual({ ml: 1500, glasses: 6, source: 'limit' })
    expect(waterGoal({ weightKg: 100, fluidLimitMl: 800 })).toEqual({ ml: 800, glasses: 3, source: 'limit' })
    expect(waterGoal({ sex: 'female', fluidLimitMl: 2500 })).toEqual({ ml: 1600, glasses: 6, source: 'sex' })
  })
  it('rounds to glasses and never goes under 4 glasses without a limit', () => {
    expect(waterGoal({ ageYears: 1 })!.glasses).toBe(4)
    expect(waterGoal({ sex: 'female', weightKg: 61 })!.ml).toBe(1830)
    expect(waterGoal({ sex: 'female', weightKg: 61 })!.glasses).toBe(7)
  })
  it('under 1 year there is no goal at all, age 0 included; 1 year keeps the child value', () => {
    expect(waterGoal({ ageYears: 0 })).toBeNull()
    expect(waterGoal({ ageYears: 0, weightKg: 8, sex: 'male', fluidLimitMl: 500 })).toBeNull()
    expect(waterGoalMl({ ageYears: 0 })).toBeNull()
    expect(waterGoal({ ageYears: 1 })).toEqual({ ml: 1040, glasses: 4, source: 'child' })
  })
  it("a doctor's limit rounds glasses down: 1150 ml is 4 glasses, never 5", () => {
    expect(waterGoal({ sex: 'male', fluidLimitMl: 1150 })).toEqual({ ml: 1150, glasses: 4, source: 'limit' })
    expect(waterGoal({ sex: 'male', fluidLimitMl: 1000 })!.glasses).toBe(4)
    expect(waterGoal({ sex: 'male', fluidLimitMl: 200 })!.glasses).toBe(1) // under one glass still shows one
  })
  it('from 70 the weight rule never goes above the sex default', () => {
    expect(waterGoalMl({ ageYears: 70, sex: 'female', weightKg: 90 })).toBe(1600)
    expect(waterGoalMl({ ageYears: 82, sex: 'male', weightKg: 90 })).toBe(2000)
    expect(waterGoalMl({ ageYears: 75, weightKg: 90 })).toBe(1800)
    expect(waterGoalMl({ ageYears: 75, sex: 'male', weightKg: 55 })).toBe(1650) // below the default: the weight rule stands
    expect(waterGoalMl({ ageYears: 69, sex: 'female', weightKg: 90 })).toBe(2700)
  })
})

describe('goalGlasses', () => {
  it('rounds to the nearest glass, but a doctor limit rounds down and never shows under 1', () => {
    expect(goalGlasses(1150)).toBe(5)
    expect(goalGlasses(1150, 'weight')).toBe(5)
    expect(goalGlasses(1150, 'limit')).toBe(4)
    expect(goalGlasses(100, 'limit')).toBe(1)
  })
})
