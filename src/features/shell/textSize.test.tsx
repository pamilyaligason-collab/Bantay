import 'fake-indexeddb/auto'
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { db } from '../../db'
import { TEXT_SIZE_KEY, useSavedTextSize } from './textSize'

afterEach(async () => {
  await db.kv.clear()
  delete document.documentElement.dataset.text
  document.documentElement.style.removeProperty('--text-scale')
})

describe('useSavedTextSize', () => {
  it('applies the saved size at startup', async () => {
    await db.kv.put({ key: TEXT_SIZE_KEY, value: 'xlarge' } as never)
    renderHook(() => useSavedTextSize())
    await waitFor(() => expect(document.documentElement.style.getPropertyValue('--text-scale')).toBe('1.3'))
    expect(document.documentElement.dataset.text).toBe('xlarge')
  })
  it('leaves normal untouched when nothing is saved', async () => {
    renderHook(() => useSavedTextSize())
    await new Promise((r) => setTimeout(r, 30))
    expect(document.documentElement.dataset.text).toBeUndefined()
  })
})
