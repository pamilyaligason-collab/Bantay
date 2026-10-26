import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import PlateSheet from './PlateSheet'
import { FOODS, foodByKey } from './logic'

vi.mock('../setup/useProfile', () => ({ useSelfPersonId: () => 'p-me' }))
vi.mock('./hooks', () => ({ useFood: () => [], useGoal: () => ({ sodiumMg: 2000, waterMl: 1500, potassiumMg: null, sex: null }) }))
afterEach(cleanup)
const logPlate = vi.fn(async () => 'ok' as const)
vi.mock('./actions', () => ({ logPlate: (...a: unknown[]) => (logPlate as (...x: unknown[]) => Promise<'ok'>)(...a), logSameAsYesterday: async () => ({ result: 'ok', added: 0 }) }))

describe('PlateSheet estimate labels', () => {
  it('says Estimate on a food tile that is still an estimate, and only on those', () => {
    expect(FOODS.some((f) => f.estimate)).toBe(true)
    render(<PlateSheet onDone={() => {}} />)
    const tiles = screen.getAllByRole('button').filter((b) => b.classList.contains('nu-tile'))
    const flagged = tiles.filter((b) => b.textContent?.includes('Estimate'))
    expect(flagged.length).toBeGreaterThan(0)
    for (const b of flagged) expect(b.getAttribute('aria-label')).toMatch(/, estimate$/)
    for (const b of tiles.filter((t) => !flagged.includes(t))) expect(b.getAttribute('aria-label')).not.toMatch(/estimate/)
  })
})

describe('PlateSheet meal flow', () => {
  it('one entry: the meal comes from the clock, a chip changes it, and there is no separate salt log', async () => {
    const u = userEvent.setup()
    render(<PlateSheet onDone={() => {}} />)
    const chip = screen.getByRole('button', { name: /Change/ })
    expect(chip.textContent).toMatch(/Almusal|Tanghalian|Hapunan|Meryenda/)
    expect(screen.queryByRole('group', { name: 'Meal' })).toBeNull()
    await u.click(chip)
    expect(within(screen.getByRole('group', { name: 'Meal' })).getAllByRole('button')).toHaveLength(4)
  })

  it('tiles carry a picture and the High salt tag only on salty dishes', () => {
    render(<PlateSheet onDone={() => {}} />)
    const patis = screen.getAllByRole('button').find((b) => b.getAttribute('aria-label')?.startsWith('Add Patis,'))!
    expect(patis.getAttribute('aria-label')).toMatch(/high salt/)
    expect(patis.textContent).toContain('High salt')
    const rice = screen.getAllByRole('button').find((b) => b.getAttribute('aria-label')?.startsWith('Add Kanin,'))!
    expect(rice.textContent).not.toContain('High salt')
  })

  it('the stepper goes half, 1, 1½, 2 and the plate shows salt and nutrients live', async () => {
    const u = userEvent.setup()
    render(<PlateSheet onDone={() => {}} />)
    const adobo = foodByKey('chicken_adobo')!
    await u.click(screen.getAllByRole('button').find((b) => b.getAttribute('aria-label')?.startsWith(`Add ${adobo.tl},`))!)
    const live = () => screen.getByTestId('plate-salt').textContent
    expect(live()).toBe(`${adobo.sodium_mg!.toLocaleString('en-US')} mg`)
    await u.click(screen.getByRole('button', { name: `More ${adobo.tl}` }))
    expect(live()).toBe(`${Math.round(adobo.sodium_mg! * 1.5).toLocaleString('en-US')} mg`)
    await u.click(screen.getByRole('button', { name: `More ${adobo.tl}` }))
    expect((screen.getByRole('button', { name: `More ${adobo.tl}` }) as HTMLButtonElement).disabled).toBe(true) // 2 is the top
    expect(screen.getByTestId('plate-keys').textContent).toMatch(/Protein\s*\d/)
    await u.click(screen.getByRole('button', { name: `Less ${adobo.tl}` }))
    await u.click(screen.getByRole('button', { name: `Less ${adobo.tl}` }))
    await u.click(screen.getByRole('button', { name: `Less ${adobo.tl}` }))
    expect((screen.getByRole('button', { name: `Less ${adobo.tl}` }) as HTMLButtonElement).disabled).toBe(true) // half is the bottom
  })

  it('a salty extra goes on the plate instead of saving by itself', async () => {
    const u = userEvent.setup()
    logPlate.mockClear()
    render(<PlateSheet onDone={() => {}} />)
    await u.click(within(screen.getByRole('group', { name: 'Salty extras on this meal' })).getByRole('button', { name: /^Add Toyo/ }))
    expect(logPlate).not.toHaveBeenCalled()
    expect(screen.getByText('1 on your plate')).toBeTruthy()
  })

  it('your own food saves with every number blank and shows no salt number', async () => {
    const u = userEvent.setup()
    logPlate.mockClear()
    const done = vi.fn()
    render(<PlateSheet onDone={done} />)
    await u.click(screen.getByRole('button', { name: /Add your own food/ }))
    await u.type(screen.getByRole('textbox', { name: 'Name of your own food' }), 'Kakanin ni Lola')
    await u.click(screen.getByRole('button', { name: 'Add to plate' }))
    expect(screen.getByText(/No salt number for what is on your plate/)).toBeTruthy()
    await u.click(screen.getByRole('button', { name: 'Save meal' }))
    const [items] = logPlate.mock.calls[0] as unknown as [{ food: { key: string; name: string; sodium_mg: number | null }; portion: number }[]]
    expect(items[0]).toMatchObject({ food: { key: '', name: 'Kakanin ni Lola', sodium_mg: null }, portion: 1 })
    expect(done).toHaveBeenCalled()
  })
})
