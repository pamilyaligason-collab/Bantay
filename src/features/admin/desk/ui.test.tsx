import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { act } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BulkBar, ConfirmDialog, useConfirm } from './ui'

afterEach(cleanup)

describe('BulkBar', () => {
  it('shows nothing at 0 and the count plus actions above 0', () => {
    const { container, rerender } = render(<BulkBar count={0}><button>Go</button></BulkBar>)
    expect(container.firstChild).toBeNull()
    rerender(<BulkBar count={3} noun="rows"><button>Go</button></BulkBar>)
    expect(screen.getByRole('region', { name: 'Bulk actions' }).textContent).toContain('3 rows')
    expect(screen.getByRole('button', { name: 'Go' })).toBeTruthy()
  })
})

describe('ConfirmDialog', () => {
  it('danger uses the solid red button with the verb and title', () => {
    render(<ConfirmDialog text="Archive this?" title="Archive record" verb="Archive" danger onCancel={() => undefined} onGo={() => undefined} />)
    expect(screen.getByRole('heading', { name: 'Archive record' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Archive' }).className).toContain('bad-solid')
  })
  it('defaults to a Confirm button without a title', () => {
    render(<ConfirmDialog text="Sure?" onCancel={() => undefined} onGo={() => undefined} />)
    expect(screen.queryByRole('heading')).toBeNull()
    expect(screen.getByRole('button', { name: 'Confirm' }).className).toContain('go')
  })
  it('old two-argument ask() still opens and runs', async () => {
    const run = vi.fn(async () => undefined)
    function T() { const c = useConfirm(); return <><button onClick={() => c.ask('Do it?', run)}>open</button>{c.node}</> }
    render(<T />)
    fireEvent.click(screen.getByText('open'))
    expect(screen.getByText('Do it?')).toBeTruthy()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Confirm' })) })
    expect(run).toHaveBeenCalledOnce()
  })
})
