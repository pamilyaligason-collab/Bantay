import 'fake-indexeddb/auto'
import { useState } from 'react'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../db'
import SosContactsPicker from '../sos/SosContactsPicker'
import ChipField from './ChipField'
import { PW_KEY } from '../safety/PhoneWarnings'
import { cleanItem, splitItems } from './lists'
import { notifyDone } from './steps'

const picked = vi.hoisted(() => ({ canPick: true, result: { name: 'Ana Reyes', phone: '0917 111 2222' } as { name: string; phone: string } | null }))
vi.mock('./contactPicker', () => ({ canPickContact: () => picked.canPick, pickContact: async () => picked.result }))
const native = vi.hoisted(() => ({ android: false }))
vi.mock('../safety/settingsOpener', async (orig) => ({ ...(await orig<object>()), isNativeAndroid: () => native.android, openSettings: async () => ({ ok: true, line: 'Settings opened.' }) }))

beforeEach(async () => {
  await db.kv.clear()
  picked.canPick = true
  native.android = false
  localStorage.setItem('bantay.family', JSON.stringify([{ personId: 'p1', displayName: 'Ate Joy', handle: null, provider: 'pin' }]))
})
afterEach(() => { cleanup(); localStorage.clear() })

describe('lists', () => {
  it('splits and cleans', () => {
    expect(splitItems('A, B')).toEqual(['A', 'B'])
    expect(splitItems(undefined)).toEqual([])
    expect(cleanItem('  Fish,  oil ')).toBe('Fish oil')
  })
})

describe('ChipField', () => {
  const Host = ({ multi = true, exclusive = ['None'] }: { multi?: boolean; exclusive?: string[] }) => {
    const [v, setV] = useState<string[]>([])
    return <><ChipField label="Allergies" options={['None', 'Eggs', 'Milk']} multi={multi} exclusive={exclusive} value={v} onChange={setV} /><output>{v.join('|')}</output></>
  }
  it('multi-select, None clears the rest, Other adds a typed item', async () => {
    render(<Host />)
    await userEvent.click(screen.getByRole('button', { name: 'Eggs' }))
    await userEvent.click(screen.getByRole('button', { name: 'Milk' }))
    expect(document.querySelector('output')!.textContent).toBe('Eggs|Milk')
    await userEvent.type(screen.getByLabelText('Allergies: other'), 'Mango{enter}')
    expect(document.querySelector('output')!.textContent).toBe('Eggs|Milk|Mango')
    await userEvent.click(screen.getByRole('button', { name: 'None' }))
    expect(document.querySelector('output')!.textContent).toBe('None')
    await userEvent.click(screen.getByRole('button', { name: 'Eggs' }))
    expect(document.querySelector('output')!.textContent).toBe('Eggs')
  })
  it('single-select replaces', async () => {
    render(<Host multi={false} exclusive={[]} />)
    await userEvent.click(screen.getByRole('button', { name: 'Eggs' }))
    await userEvent.click(screen.getByRole('button', { name: 'Milk' }))
    expect(document.querySelector('output')!.textContent).toBe('Milk')
  })
})

describe('notifications step', () => {
  it('is done with notifications and exact alarms on; the battery switch never blocks it', () => {
    expect(notifyDone({ display: true, exact: true, battery: false })).toBe(true)
    expect(notifyDone({ display: true, exact: false, battery: true })).toBe(false)
  })
})

describe('SOS picker', () => {
  it('family chip fills the first empty slot with the name only', async () => {
    render(<SosContactsPicker />)
    await userEvent.click(await screen.findByRole('button', { name: 'Ate Joy' }))
    expect((screen.getByLabelText('Contact 1 name') as HTMLInputElement).value).toBe('Ate Joy')
    expect(screen.queryByRole('button', { name: 'Ate Joy' })).toBeNull() // already used
    await waitFor(async () => expect((await db.kv.get('sos.contacts'))?.value).toEqual([{ name: 'Ate Joy', phone: '', personId: 'p1' }]))
  })
  it('phonebook fills name and phone, and keeps a family member name', async () => {
    render(<SosContactsPicker />)
    const pick = await screen.findAllByRole('button', { name: 'Pick from phonebook' })
    await userEvent.click(pick[0]!)
    expect((screen.getByLabelText('Contact 1 name') as HTMLInputElement).value).toBe('Ana Reyes')
    expect((screen.getByLabelText('Contact 1 phone number') as HTMLInputElement).value).toBe('0917 111 2222')
    await userEvent.click(screen.getByRole('button', { name: 'Ate Joy' }))
    await userEvent.click(pick[1]!)
    expect((screen.getByLabelText('Contact 2 name') as HTMLInputElement).value).toBe('Ate Joy')
    expect((screen.getByLabelText('Contact 2 phone number') as HTMLInputElement).value).toBe('0917 111 2222')
  })
  it('cancelled pick changes nothing; hidden on the web', async () => {
    picked.result = null
    render(<SosContactsPicker />)
    await userEvent.click((await screen.findAllByRole('button', { name: 'Pick from phonebook' }))[0]!)
    expect((screen.getByLabelText('Contact 1 name') as HTMLInputElement).value).toBe('')
    cleanup()
    picked.canPick = false
    render(<SosContactsPicker />)
    await screen.findByLabelText('Contact 1 name')
    expect(screen.queryByRole('button', { name: 'Pick from phonebook' })).toBeNull()
    picked.result = { name: 'Ana Reyes', phone: '0917 111 2222' }
  })
})

describe('warnings step on Android', () => {
  it('Yes is stored once and never asked again; No keeps the hint', async () => {
    native.android = true
    const { default: WarningsStep } = await import('./WarningsStep')
    render(<WarningsStep />)
    await userEvent.click(await screen.findByRole('button', { name: 'No' }))
    expect(screen.getByText(/come back and tap Yes/)).toBeTruthy()
    expect((await db.kv.get('setup.warnings'))?.value).toBeUndefined()
    await userEvent.click(screen.getByRole('button', { name: 'Yes' }))
    await waitFor(async () => expect((await db.kv.get('setup.warnings'))?.value).toBe(true))
    const rec = (await db.kv.get(PW_KEY))?.value as { items: Record<string, { state: string }> }
    expect(Object.values(rec.items).every((i) => i.state === 'on')).toBe(true)
    cleanup()
    render(<WarningsStep />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Yes' }).getAttribute('aria-pressed')).toBe('true'))
  })
})
