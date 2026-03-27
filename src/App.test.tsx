import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import App from './App'

function getPlanFormSection(headingName: string) {
  const heading = screen
    .getAllByRole('heading', { name: headingName })
    .find((element) => element.tagName === 'H2')
  const section = heading?.closest('section')

  if (!section) {
    throw new Error(`Expected section for ${headingName}`)
  }

  return section
}

function getSummaryCard(headingName: string) {
  const heading = screen
    .getAllByRole('heading', { name: headingName })
    .find((element) => element.tagName === 'H3')
  const article = heading?.closest('article')

  if (!article) {
    throw new Error(`Expected summary card for ${headingName}`)
  }

  return article
}

describe('App integration', () => {
  it('updates totals when annual medical spend changes', async () => {
    const user = userEvent.setup()
    render(<App />)

    const spendInput = screen.getByLabelText('Annual Medical Spend')
    await user.clear(spendInput)
    await user.type(spendInput, '0')

    const ppoSummaryCard = getSummaryCard('PPO Plan')
    const hdhpSummaryCard = getSummaryCard('HDHP Plan')

    expect(within(ppoSummaryCard).getByText('$2,840.00')).toBeInTheDocument()
    expect(within(hdhpSummaryCard).getByText('$420.00')).toBeInTheDocument()
    expect(
      screen.getByText(/HDHP Plan is currently cheaper by \$2,420\.00\./)
    ).toBeInTheDocument()
  })

  it('updates totals and cheaper-plan highlight when plan inputs change', async () => {
    const user = userEvent.setup()
    render(<App />)

    const monthlyPremiumInputs = screen.getAllByLabelText('Monthly Premium')
    await user.clear(monthlyPremiumInputs[0])
    await user.type(monthlyPremiumInputs[0], '100')

    const ppoFormSection = getPlanFormSection('PPO Plan')
    const hdhpFormSection = getPlanFormSection('HDHP Plan')
    const ppoSummaryCard = getSummaryCard('PPO Plan')
    const hdhpSummaryCard = getSummaryCard('HDHP Plan')

    expect(within(ppoSummaryCard).getByText('$2,400.00')).toBeInTheDocument()
    expect(within(hdhpSummaryCard).getByText('$3,800.00')).toBeInTheDocument()
    expect(within(ppoFormSection).getByText('Lower Total Cost')).toBeInTheDocument()
    expect(within(hdhpFormSection).queryByText('Lower Total Cost')).not.toBeInTheDocument()
    expect(
      screen.getByText(/PPO Plan is currently cheaper by \$1,400\.00\./)
    ).toBeInTheDocument()
  })

  it('shows decimal annual cost values in the comparison cards', async () => {
    const user = userEvent.setup()
    render(<App />)

    const monthlyPremiumInputs = screen.getAllByLabelText('Monthly Premium')
    await user.clear(monthlyPremiumInputs[0])
    await user.type(monthlyPremiumInputs[0], '123.45')

    const ppoSummaryCard = getSummaryCard('PPO Plan')
    expect(within(ppoSummaryCard).getByText('$2,681.40')).toBeInTheDocument()
    expect(within(ppoSummaryCard).getByText('Annual premium: $1,481.40')).toBeInTheDocument()
  })

  it('shows validation messages for invalid plan and spend inputs', async () => {
    const user = userEvent.setup()
    render(<App />)

    const spendInput = screen.getByLabelText('Annual Medical Spend')
    fireEvent.change(spendInput, { target: { value: '-50' } })

    const planNameInputs = screen.getAllByLabelText('Plan Name')
    await user.clear(planNameInputs[0])

    const coinsuranceInputs = screen.getAllByLabelText('Coinsurance (%)')
    await user.clear(coinsuranceInputs[0])
    await user.type(coinsuranceInputs[0], '150')

    expect(screen.getByText('Annual medical spend cannot be negative.')).toBeInTheDocument()
    expect(screen.getByText('Plan name is required.')).toBeInTheDocument()
    expect(screen.getByText('Coinsurance must be between 0 and 100.')).toBeInTheDocument()
    expect(
      screen.getByText(/Review the highlighted fields\. Totals still render using sanitized values/)
    ).toBeInTheDocument()
  })
})
