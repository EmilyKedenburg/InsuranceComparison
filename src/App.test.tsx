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

    expect(within(ppoSummaryCard).getByText('$2,840')).toBeInTheDocument()
    expect(within(hdhpSummaryCard).getByText('$420')).toBeInTheDocument()
    expect(
      screen.getByText(/HDHP Plan is currently the cheapest plan by \$2,420\./)
    ).toBeInTheDocument()
  })

  it('uses family coverage thresholds when family coverage is selected', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'family' }))

    const ppoSummaryCard = getSummaryCard('PPO Plan')
    const hdhpSummaryCard = getSummaryCard('HDHP Plan')

    expect(within(ppoSummaryCard).getByText('$6,240')).toBeInTheDocument()
    expect(within(hdhpSummaryCard).getByText('$5,420')).toBeInTheDocument()
    expect(screen.getByText('family coverage selected')).toBeInTheDocument()
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

    expect(within(ppoSummaryCard).getByText('$2,400')).toBeInTheDocument()
    expect(within(hdhpSummaryCard).getByText('$3,800')).toBeInTheDocument()
    expect(within(ppoFormSection).getByText('Lower Total Cost')).toBeInTheDocument()
    expect(within(hdhpFormSection).queryByText('Lower Total Cost')).not.toBeInTheDocument()
    expect(
      screen.getByText(/PPO Plan is currently the cheapest plan by \$1,400\./)
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

  it('updates totals when hsa contribution changes', async () => {
    const user = userEvent.setup()
    render(<App />)

    const contributionInputs = screen.getAllByLabelText('HSA Contribution')
    await user.clear(contributionInputs[0])
    await user.type(contributionInputs[0], '500')

    const ppoSummaryCard = getSummaryCard('PPO Plan')
    expect(within(ppoSummaryCard).getByText('$4,540')).toBeInTheDocument()
    expect(within(ppoSummaryCard).getByText('HSA contribution: -$500')).toBeInTheDocument()
    expect(within(ppoSummaryCard).getByText('Total contributions: -$1,500')).toBeInTheDocument()
  })

  it('lets a user switch a plan between hsa and hra contribution types', async () => {
    const user = userEvent.setup()
    render(<App />)

    const typeSelects = screen.getAllByLabelText('Account Contribution Type')
    await user.selectOptions(typeSelects[0], 'hra')

    expect(screen.getAllByLabelText('HRA Contribution')).toHaveLength(1)
    expect(screen.getAllByLabelText('HSA Contribution')).toHaveLength(1)

    const ppoSummaryCard = getSummaryCard('PPO Plan')
    expect(within(ppoSummaryCard).getByText('HRA contribution: -$0')).toBeInTheDocument()
  })

  it('disables family deductible and oop fields during individual coverage', () => {
    render(<App />)

    expect(screen.getAllByLabelText('Individual Deductible')).toHaveLength(2)
    expect(screen.getAllByLabelText('Individual OOP Max')).toHaveLength(2)
    screen.getAllByLabelText('Family Deductible').forEach((field) => {
      expect(field).toBeDisabled()
    })
    screen.getAllByLabelText('Family OOP Max').forEach((field) => {
      expect(field).toBeDisabled()
    })
  })

  it('disables individual deductible and oop fields during family coverage', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'family' }))

    expect(screen.getAllByLabelText('Family Deductible')).toHaveLength(2)
    expect(screen.getAllByLabelText('Family OOP Max')).toHaveLength(2)
    screen.getAllByLabelText('Individual Deductible').forEach((field) => {
      expect(field).toBeDisabled()
    })
    screen.getAllByLabelText('Individual OOP Max').forEach((field) => {
      expect(field).toBeDisabled()
    })
    screen.getAllByLabelText('Family Deductible').forEach((field) => {
      expect(field).not.toBeDisabled()
    })
  })

  it('allows switching between plan view modes', async () => {
    const user = userEvent.setup()
    render(<App />)

    const planLayout = screen.getByTestId('plan-layout')
    const gridButton = screen.getByRole('button', { name: '2x2' })
    const scrollButton = screen.getByRole('button', { name: 'Scroll' })
    const condensedButton = screen.getByRole('button', { name: 'Condensed' })

    expect(scrollButton).toHaveAttribute('aria-pressed', 'true')

    await user.click(gridButton)
    expect(gridButton).toHaveAttribute('aria-pressed', 'true')
    expect(planLayout.className).not.toContain('overflow-x-auto')

    await user.click(condensedButton)
    expect(condensedButton).toHaveAttribute('aria-pressed', 'true')
    expect(planLayout.className).not.toContain('overflow-x-auto')

    await user.click(scrollButton)
    expect(scrollButton).toHaveAttribute('aria-pressed', 'true')
    expect(planLayout.className).toContain('overflow-x-auto')
  })

  it('allows adding up to four plans and disables adding beyond that', async () => {
    const user = userEvent.setup()
    render(<App />)

    const addPlanButton = screen.getByRole('button', { name: 'Add Plan' })
    await user.click(addPlanButton)
    await user.click(addPlanButton)

    expect(screen.getAllByRole('heading', { name: 'EPO Plan' }).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('heading', { name: 'Copay Plan' }).length).toBeGreaterThan(0)
    expect(addPlanButton).toBeDisabled()
  })

  it('allows removing an added plan while keeping the original two plans', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Add Plan' }))
    expect(screen.getAllByRole('heading', { name: 'EPO Plan' }).length).toBeGreaterThan(0)

    const epoPlanFormSection = getPlanFormSection('EPO Plan')
    await user.click(within(epoPlanFormSection).getByRole('button', { name: 'Remove Plan' }))

    expect(screen.queryAllByRole('heading', { name: 'EPO Plan' })).toHaveLength(0)
    expect(screen.getAllByRole('heading', { name: 'PPO Plan' }).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('heading', { name: 'HDHP Plan' }).length).toBeGreaterThan(0)
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
