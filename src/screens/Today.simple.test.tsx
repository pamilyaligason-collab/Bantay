import 'fake-indexeddb/auto'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../db'

vi.mock('../features/notify/AlertsBanner', () => ({ default: () => <div data-testid="alerts" /> }))
vi.mock('../features/safety/NewsTop5', () => ({ default: () => <div data-testid="news" /> }))
vi.mock('../features/sensors/MovementCard', () => ({ default: () => <div data-testid="movement" /> }))
vi.mock('../features/sensors/QuickWalk', () => ({ default: () => <div data-testid="walk" /> }))
vi.mock('../features/today/Hero', () => ({ default: () => <div data-testid="hero" /> }))
vi.mock('../features/today/NearbyList', () => ({ default: () => <div data-testid="nearby" /> }))
vi.mock('../features/today/QuickLog', () => ({ default: () => <div data-testid="quicklog" /> }))
vi.mock('../features/today/SetupCard', () => ({ default: () => <div data-testid="setup" /> }))
vi.mock('../features/today/VideoCard', () => ({ default: () => <div data-testid="video" /> }))
vi.mock('../features/update/PwaBanner', () => ({ PwaBanner: () => null }))
vi.mock('../features/update/UpdateCard', () => ({ UpdateCard: () => null }))
import Today from './Today'

beforeEach(async () => { await db.kv.clear() })
afterEach(cleanup)

describe('Today simple mode', () => {
  it('off: the full page', async () => {
    render(<Today />)
    await screen.findByTestId('quicklog')
    expect(screen.getByTestId('news')).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'SOS' })).toBeNull()
  })
  it('on: only the hero and three big buttons', async () => {
    await db.kv.put({ key: 'mode.simple', value: true })
    render(<Today />)
    await screen.findByTestId('hero')
    expect(screen.getByRole('button', { name: "I'm OK" })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'SOS' }).getAttribute('href')).toBe('#safety')
    expect(screen.getByRole('link', { name: 'Add a family number' }).getAttribute('href')).toBe('#safety') // no SOS contact saved yet
    for (const id of ['quicklog', 'news', 'nearby', 'movement', 'video', 'setup']) expect(screen.queryByTestId(id)).toBeNull()
  })
  it('on with an SOS contact: Call family dials the first valid number', async () => {
    await db.kv.put({ key: 'mode.simple', value: true })
    await db.kv.put({ key: 'sos.contacts', value: [{ name: 'Ate Joy', phone: '+63 917 123 4567' }] })
    render(<Today />)
    const call = await screen.findByRole('link', { name: 'Call family' })
    expect(call.getAttribute('href')).toBe('tel:+639171234567')
  })
})
