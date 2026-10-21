import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { LabsList } from './LabsList'

describe('LabsList empty state', () => {
  it('says so when ready with no lab rows', () => {
    render(<LabsList readings={[]} thresholds={[]} ready />)
    expect(screen.getByText('No lab results yet. Scan a paper with Ask.')).toBeTruthy()
  })
  it('renders nothing until ready', () => {
    const { container } = render(<LabsList readings={[]} thresholds={[]} ready={false} />)
    expect(container.innerHTML).toBe('')
  })
})
