import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
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

afterEach(() => {
  vi.restoreAllMocks()
})

describe('App integration', () => {
  it('updates totals when annual medical spend changes', async () => {
    const user = userEvent.setup()
    render(<App />)

    const spendInput = screen.getByLabelText('Estimated Annual Medical Spend')
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

  it('keeps the estimated annual medical spend input synced with the slider', () => {
    render(<App />)

    const spendInput = screen.getByLabelText('Estimated Annual Medical Spend')
    const spendSlider = screen.getByLabelText('Estimated Annual Medical Spend Slider')

    fireEvent.change(spendSlider, { target: { value: '0' } })

    expect(spendInput).toHaveValue(0)

    const ppoSummaryCard = getSummaryCard('PPO Plan')
    expect(within(ppoSummaryCard).getByText('$2,840')).toBeInTheDocument()
  })

  it('clicking Healthy sets annual medical spend to 500', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: /Healthy:/ }))

    expect(screen.getByLabelText('Estimated Annual Medical Spend')).toHaveValue(500)
  })

  it('clicking Moderate sets annual medical spend to 5000', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: /Moderate:/ }))

    expect(screen.getByLabelText('Estimated Annual Medical Spend')).toHaveValue(5000)
  })

  it('clicking Worst Case sets annual medical spend to 50000', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: /Worst Case:/ }))

    expect(screen.getByLabelText('Estimated Annual Medical Spend')).toHaveValue(50000)
  })

  it('uses family preset values after switching coverage type', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'family' }))
    await user.click(screen.getByRole('button', { name: /Healthy:/ }))
    expect(screen.getByLabelText('Estimated Annual Medical Spend')).toHaveValue(1500)

    await user.click(screen.getByRole('button', { name: /Moderate:/ }))
    expect(screen.getByLabelText('Estimated Annual Medical Spend')).toHaveValue(12000)

    await user.click(screen.getByRole('button', { name: /Worst Case:/ }))
    expect(screen.getByLabelText('Estimated Annual Medical Spend')).toHaveValue(50000)
  })

  it('interprets a plain-English scenario and applies the structured spend through the calculator', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        scenarioType: 'maternity',
        estimatedAnnualMedicalSpend: 14000,
        assumptions: ['Pregnancy care', 'Delivery costs', 'Routine labs'],
        confidence: 0.82,
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)

    await user.type(
      screen.getByLabelText('Scenario Description'),
      'We are planning for pregnancy care, delivery, and regular follow-up visits.',
    )
    await user.click(screen.getByRole('button', { name: 'Interpret Scenario' }))

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/ai-scenario',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    const postedPayload = JSON.parse(fetchMock.mock.calls[0][1].body as string)
    expect(postedPayload.userInput).toBe(
      'We are planning for pregnancy care, delivery, and regular follow-up visits.',
    )
    expect(postedPayload.coverageType).toBe('individual')
    expect(postedPayload.plans).toHaveLength(2)

    expect(screen.getByLabelText('Estimated Annual Medical Spend')).toHaveValue(14000)
    expect(screen.getByText('maternity')).toBeInTheDocument()
    expect(screen.getByText(/Confidence 82%/)).toBeInTheDocument()
    expect(screen.getByText('Pregnancy care')).toBeInTheDocument()
    expect(
      screen.getByText(/Financial simulation only\. Not medical advice\./),
    ).toBeInTheDocument()

    const ppoSummaryCard = getSummaryCard('PPO Plan')
    expect(within(ppoSummaryCard).getByText('$6,840')).toBeInTheDocument()
  })

  it('does not call the consultant when the scenario description is blank', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Interpret Scenario' }))

    expect(fetchMock).not.toHaveBeenCalled()
    expect(
      screen.getByText('Describe your expected healthcare year before running the consultant.'),
    ).toBeInTheDocument()
  })

  it('shows the backend error when scenario interpretation fails', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({
        error: 'The AI response did not include the required scenario tool call.',
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)

    await user.type(
      screen.getByLabelText('Scenario Description'),
      'I have a chronic condition with regular medication and specialist visits.',
    )
    await user.click(screen.getByRole('button', { name: 'Interpret Scenario' }))

    expect(
      screen.getByText('The AI response did not include the required scenario tool call.'),
    ).toBeInTheDocument()
  })

  it('clears any active spend preset after applying an interpreted scenario', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        scenarioType: 'chronic_condition',
        estimatedAnnualMedicalSpend: 9600,
        assumptions: ['Monthly prescriptions', 'Quarterly specialist visits'],
        confidence: 0.74,
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)

    const moderatePreset = screen.getByRole('button', { name: /Moderate:/ })
    expect(moderatePreset).toHaveAttribute('aria-pressed', 'true')

    await user.type(
      screen.getByLabelText('Scenario Description'),
      'I expect regular specialist visits and medication refills all year.',
    )
    await user.click(screen.getByRole('button', { name: 'Interpret Scenario' }))

    expect(moderatePreset).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByLabelText('Estimated Annual Medical Spend')).toHaveValue(9600)
  })

  it('shows a user-friendly timeout error from the consultant backend', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({
        error: 'The AI consultant took too long to respond. Please try again in a moment.',
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)

    await user.type(
      screen.getByLabelText('Scenario Description'),
      'Please estimate a year with recurring appointments and a possible hospital stay.',
    )
    await user.click(screen.getByRole('button', { name: 'Interpret Scenario' }))

    expect(
      screen.getByText('The AI consultant took too long to respond. Please try again in a moment.'),
    ).toBeInTheDocument()
  })

  it('recalculates totals after plan edits following an AI scenario', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        scenarioType: 'moderate',
        estimatedAnnualMedicalSpend: 14000,
        assumptions: ['Specialist visits'],
        confidence: 0.8,
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)

    await user.type(screen.getByLabelText('Scenario Description'), 'Moderate year')
    await user.click(screen.getByRole('button', { name: 'Interpret Scenario' }))

    const monthlyPremiumInput = screen.getAllByLabelText('Monthly Premium')[0]
    await user.click(monthlyPremiumInput)
    await user.type(monthlyPremiumInput, '100')

    const ppoSummaryCard = getSummaryCard('PPO Plan')
    expect(within(ppoSummaryCard).getByText('$4,200')).toBeInTheDocument()
    expect(screen.getByText('moderate')).toBeInTheDocument()
  })

  it('keeps interpreted scenario output and recalculates after coverage type changes', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        scenarioType: 'moderate',
        estimatedAnnualMedicalSpend: 14000,
        assumptions: ['Specialist visits'],
        confidence: 0.8,
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)

    await user.type(screen.getByLabelText('Scenario Description'), 'Moderate year')
    await user.click(screen.getByRole('button', { name: 'Interpret Scenario' }))
    await user.click(screen.getByRole('button', { name: 'family' }))

    const ppoSummaryCard = getSummaryCard('PPO Plan')
    expect(within(ppoSummaryCard).getByText('$8,040')).toBeInTheDocument()
    expect(screen.getByText('moderate')).toBeInTheDocument()
    expect(screen.getByText('AI Estimate')).toBeInTheDocument()
  })

  it('keeps AI interpretation visible after a manual annual spend edit', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        scenarioType: 'major_event',
        estimatedAnnualMedicalSpend: 50000,
        assumptions: ['Hospitalization'],
        confidence: 0.7,
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)

    await user.type(screen.getByLabelText('Scenario Description'), 'Major event year')
    await user.click(screen.getByRole('button', { name: 'Interpret Scenario' }))

    const spendInput = screen.getByLabelText('Estimated Annual Medical Spend')
    await user.click(spendInput)
    await user.clear(spendInput)
    await user.type(spendInput, '600')

    expect(screen.getByText('major event')).toBeInTheDocument()
    expect(screen.getByText('Manual override applied')).toBeInTheDocument()
    expect(screen.getByText('AI Estimate')).toBeInTheDocument()
    expect(screen.getByText('Current Spend')).toBeInTheDocument()
  })

  it('shows both the AI estimate and current spend when manually overridden', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        scenarioType: 'chronic_condition',
        estimatedAnnualMedicalSpend: 8000,
        assumptions: ['Specialist visits'],
        confidence: 0.78,
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)

    await user.type(screen.getByLabelText('Scenario Description'), 'Chronic condition year')
    await user.click(screen.getByRole('button', { name: 'Interpret Scenario' }))

    const spendInput = screen.getByLabelText('Estimated Annual Medical Spend')
    await user.clear(spendInput)
    await user.type(spendInput, '9200')

    expect(screen.getByText('$8,000')).toBeInTheDocument()
    expect(screen.getByText('$9,200')).toBeInTheDocument()
    expect(screen.getByText('Using your current spend override in the calculator.')).toBeInTheDocument()
  })

  it('clicking reapply ai estimate restores the ai-estimated spend', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        scenarioType: 'major_event',
        estimatedAnnualMedicalSpend: 20000,
        assumptions: ['Hospital stay'],
        confidence: 0.7,
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)

    await user.type(screen.getByLabelText('Scenario Description'), 'Major event year')
    await user.click(screen.getByRole('button', { name: 'Interpret Scenario' }))

    const spendInput = screen.getByLabelText('Estimated Annual Medical Spend')
    await user.clear(spendInput)
    await user.type(spendInput, '600')
    await user.click(screen.getByRole('button', { name: 'Reapply AI Estimate' }))

    expect(spendInput).toHaveValue(20000)
  })

  it('override state clears after reapplying the ai estimate', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        scenarioType: 'major_event',
        estimatedAnnualMedicalSpend: 20000,
        assumptions: ['Hospital stay'],
        confidence: 0.7,
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)

    await user.type(screen.getByLabelText('Scenario Description'), 'Major event year')
    await user.click(screen.getByRole('button', { name: 'Interpret Scenario' }))

    const spendInput = screen.getByLabelText('Estimated Annual Medical Spend')
    await user.clear(spendInput)
    await user.type(spendInput, '600')
    expect(screen.getByText('Manual override applied')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Reapply AI Estimate' }))

    expect(screen.queryByText('Manual override applied')).not.toBeInTheDocument()
    expect(screen.getByText('Using the latest AI-estimated spend.')).toBeInTheDocument()
  })

  it('override state clears when the current spend matches the ai estimate again', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        scenarioType: 'moderate',
        estimatedAnnualMedicalSpend: 14000,
        assumptions: ['Specialist visits'],
        confidence: 0.8,
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)

    await user.type(screen.getByLabelText('Scenario Description'), 'Moderate year')
    await user.click(screen.getByRole('button', { name: 'Interpret Scenario' }))

    const spendInput = screen.getByLabelText('Estimated Annual Medical Spend')
    await user.clear(spendInput)
    await user.type(spendInput, '15000')
    expect(screen.getByText('Manual override applied')).toBeInTheDocument()

    await user.clear(spendInput)
    await user.type(spendInput, '14000')

    expect(screen.queryByText('Manual override applied')).not.toBeInTheDocument()
    expect(screen.getByText('Using the latest AI-estimated spend.')).toBeInTheDocument()
  })

  it('renders a winning-plan explanation and updates it based on calculator results', async () => {
    const user = userEvent.setup()
    render(<App />)

    expect(screen.getByText('Why this plan is cheaper')).toBeInTheDocument()
    expect(
      screen.getByText(/HDHP Plan has a lower annual premium by \$1,620\./),
    ).toBeInTheDocument()

    const monthlyPremiumInputs = screen.getAllByLabelText('Monthly Premium')
    await user.clear(monthlyPremiumInputs[0])
    await user.type(monthlyPremiumInputs[0], '100')

    expect(
      screen.getByText(/PPO Plan has a lower annual premium by \$1,020\./),
    ).toBeInTheDocument()
  })

  it('recalculates after plan edits and coverage changes while keeping ai details visible', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        scenarioType: 'moderate',
        estimatedAnnualMedicalSpend: 14000,
        assumptions: ['Specialist visits'],
        confidence: 0.8,
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)

    await user.type(screen.getByLabelText('Scenario Description'), 'Moderate year')
    await user.click(screen.getByRole('button', { name: 'Interpret Scenario' }))

    const monthlyPremiumInput = screen.getAllByLabelText('Monthly Premium')[0]
    await user.clear(monthlyPremiumInput)
    await user.type(monthlyPremiumInput, '100')
    await user.click(screen.getByRole('button', { name: 'family' }))

    const ppoSummaryCard = getSummaryCard('PPO Plan')
    expect(within(ppoSummaryCard).getByText('$5,400')).toBeInTheDocument()
    expect(screen.getByText('moderate')).toBeInTheDocument()
    expect(screen.getAllByText('$14,000').length).toBeGreaterThan(0)
  })

  it('updates displayed total costs after clicking a preset', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: /Healthy:/ }))

    const ppoSummaryCard = getSummaryCard('PPO Plan')
    const hdhpSummaryCard = getSummaryCard('HDHP Plan')

    expect(within(ppoSummaryCard).getByText('$3,340')).toBeInTheDocument()
    expect(within(hdhpSummaryCard).getByText('$920')).toBeInTheDocument()
  })

  it('highlights the selected preset and clears it after manual spend entry', async () => {
    const user = userEvent.setup()
    render(<App />)

    const healthyPreset = screen.getByRole('button', { name: /Healthy:/ })
    const moderatePreset = screen.getByRole('button', { name: /Moderate:/ })
    const spendInput = screen.getByLabelText('Estimated Annual Medical Spend')

    expect(moderatePreset).toHaveAttribute('aria-pressed', 'true')

    await user.click(healthyPreset)
    expect(healthyPreset).toHaveAttribute('aria-pressed', 'true')
    expect(moderatePreset).toHaveAttribute('aria-pressed', 'false')

    await user.click(spendInput)
    await user.type(spendInput, '750')
    expect(healthyPreset).toHaveAttribute('aria-pressed', 'false')
  })

  it('shows a styled tooltip for spend presets', async () => {
    const user = userEvent.setup()
    render(<App />)

    const healthyPreset = screen.getByRole('button', { name: /Healthy:/ })
    await user.hover(healthyPreset)

    expect(screen.getByRole('tooltip')).toHaveTextContent('Preventative care only.')
  })

  it('shows family-appropriate preset tooltip text in family mode', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'family' }))
    const healthyPreset = screen.getByRole('button', { name: /Healthy:/ })
    await user.hover(healthyPreset)

    expect(screen.getByRole('tooltip')).toHaveTextContent(
      'Preventative care and routine family visits.',
    )
  })

  it('uses family coverage thresholds when family coverage is selected', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'family' }))

    const ppoSummaryCard = getSummaryCard('PPO Plan')
    const hdhpSummaryCard = getSummaryCard('HDHP Plan')

    expect(within(ppoSummaryCard).getByText('$7,640')).toBeInTheDocument()
    expect(within(hdhpSummaryCard).getByText('$7,380')).toBeInTheDocument()
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
    expect(within(ppoSummaryCard).getByText('Adjusted medical cost: $1,700')).toBeInTheDocument()
  })

  it('updates totals when hra contribution changes', async () => {
    const user = userEvent.setup()
    render(<App />)

    const contributionInputs = screen.getAllByLabelText('HRA Contribution')
    await user.clear(contributionInputs[0])
    await user.type(contributionInputs[0], '400')
    const ppoSummaryCard = getSummaryCard('PPO Plan')
    expect(within(ppoSummaryCard).getByText('HRA contribution: -$400')).toBeInTheDocument()
    expect(within(ppoSummaryCard).getByText('Adjusted medical cost: $1,800')).toBeInTheDocument()
  })

  it('replaces a prefilled zero when typing into a numeric field', async () => {
    const user = userEvent.setup()
    render(<App />)

    const contributionInput = screen.getAllByLabelText('HSA Contribution')[0]
    await user.click(contributionInput)
    await user.type(contributionInput, '100')

    expect(contributionInput).toHaveValue(100)
  })

  it('selects the current input value when a user focuses a filled field', async () => {
    const user = userEvent.setup()
    render(<App />)

    const monthlyPremiumInput = screen.getAllByLabelText('Monthly Premium')[0]
    await user.click(monthlyPremiumInput)
    await user.type(monthlyPremiumInput, '4')

    expect(monthlyPremiumInput).toHaveValue(4)
  })

  it('allows a numeric field to stay empty while active and defaults it back to zero on blur', async () => {
    const user = userEvent.setup()
    render(<App />)

    const hraInput = screen.getAllByLabelText('HRA Contribution')[0]
    await user.click(hraInput)
    await user.clear(hraInput)

    expect(hraInput).toHaveValue(null)

    await user.tab()

    expect(hraInput).toHaveValue(0)
  })

  it('tabs through input fields without focusing buttons', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.tab()
    expect(screen.getByLabelText('Estimated Annual Medical Spend')).toHaveFocus()

    await user.tab()
    expect(screen.getByLabelText('Scenario Description')).toHaveFocus()

    await user.tab()
    expect(screen.getAllByLabelText('Plan Name')[0]).toHaveFocus()
  })

  it('applies hsa and hra together in the comparison breakdown', async () => {
    const user = userEvent.setup()
    render(<App />)

    const hsaInputs = screen.getAllByLabelText('HSA Contribution')
    await user.clear(hsaInputs[0])
    await user.type(hsaInputs[0], '500')

    const hraInputs = screen.getAllByLabelText('HRA Contribution')
    await user.clear(hraInputs[0])
    await user.type(hraInputs[0], '300')

    const ppoSummaryCard = getSummaryCard('PPO Plan')
    expect(within(ppoSummaryCard).getByText('HSA contribution: -$500')).toBeInTheDocument()
    expect(within(ppoSummaryCard).getByText('HRA contribution: -$300')).toBeInTheDocument()
    expect(within(ppoSummaryCard).getByText('Adjusted medical cost: $1,400')).toBeInTheDocument()
    expect(within(ppoSummaryCard).getByText('$4,240')).toBeInTheDocument()
  })

  it('shows a styled tooltip with hsa or hra specific help text', async () => {
    const user = userEvent.setup()
    render(<App />)

    const ppoFormSection = getPlanFormSection('PPO Plan')
    const hsaHelpButton = within(ppoFormSection).getByRole('button', {
      name: 'HSA Contribution help',
    })

    await user.hover(hsaHelpButton)
    expect(screen.getByRole('tooltip')).toHaveTextContent(
      'HSA: money deposited into a health savings account that the employee owns.',
    )

    await user.unhover(hsaHelpButton)
    const hraHelpButton = within(ppoFormSection).getByRole('button', {
      name: 'HRA Contribution help',
    })
    await user.hover(hraHelpButton)

    expect(screen.getByRole('tooltip')).toHaveTextContent(
      'HRA: employer-funded reimbursement money that is controlled by the employer.',
    )
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

  it('sizes condensed view columns evenly based on the current plan count', async () => {
    const user = userEvent.setup()
    render(<App />)

    const condensedButton = screen.getByRole('button', { name: 'Condensed' })
    const planLayout = screen.getByTestId('plan-layout').firstElementChild as HTMLElement

    await user.click(condensedButton)
    expect(planLayout.style.gridTemplateColumns).toBe('repeat(2, minmax(0, 1fr))')

    const addPlanButton = screen.getByRole('button', { name: 'Add Plan' })
    await user.click(addPlanButton)
    expect(planLayout.style.gridTemplateColumns).toBe('repeat(3, minmax(0, 1fr))')

    await user.click(addPlanButton)
    expect(planLayout.style.gridTemplateColumns).toBe('repeat(4, minmax(0, 1fr))')
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

    const spendInput = screen.getByLabelText('Estimated Annual Medical Spend')
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
