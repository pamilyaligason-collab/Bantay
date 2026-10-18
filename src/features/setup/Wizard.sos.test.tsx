import 'fake-indexeddb/auto'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db } from '../../db'
import Me from '../../screens/Me'
import userEvent from '@testing-library/user-event'
import Wizard from './Wizard'

beforeEach(async () => {
  await db.kv.clear()
  localStorage.setItem('bantay.family', JSON.stringify([{ personId: 'p0', displayName: 'Mama', handle: null, provider: 'pin' }]))
  await db.kv.put({ key: 'sos.contacts', value: ['p0', '09179998888'] }) // old shapes, migrated on read
})
afterEach(() => { cleanup(); localStorage.clear() })

const read = () => ['Contact 1 name', 'Contact 1 phone number', 'Contact 2 name', 'Contact 2 phone number'].map((l) => (screen.getByLabelText(l) as HTMLInputElement).value)

describe('SOS contacts are one value', () => {
  it('the wizard step and Me show the same migrated contacts', async () => {
    render(<Wizard start="sos" onDone={() => undefined} />)
    await screen.findByLabelText('Contact 1 name')
    await screen.findByDisplayValue('09179998888')
    const wizard = read()
    cleanup()
    render(<Me />)
    await userEvent.click(await screen.findByRole('button', { name: /Who gets your SOS text/ }))
    await screen.findByDisplayValue('09179998888')
    expect(read()).toEqual(wizard)
    expect(wizard).toEqual(['Mama', '', 'Contact', '09179998888'])
  })
})
