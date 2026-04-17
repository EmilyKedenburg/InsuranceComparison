import { useState } from 'react'
import type { FocusEvent, MouseEvent } from 'react'
import { ComparisonResults } from './components/ComparisonResults'
import { PlanForm } from './components/PlanForm'
import { defaultPlans } from './data/defaultPlans'
import { consultantDisclaimer } from './lib/consultant'
import { interpretScenario } from './lib/consultantClient'
import { calculateAnnualCost, getCheapestPlanIndex } from './lib/insurance'
import { validateAnnualMedicalSpend, validatePlan } from './lib/validation'
import type { CoverageType, InsurancePlan } from './types/insurance'
import type { ScenarioInterpretation } from './types/consultant'

const minimumPlanCount = 2
const maximumPlanCount = 4
const annualMedicalSpendSliderMax = 50000
const annualMedicalSpendSliderStep = 100
const initialPlans = structuredClone(defaultPlans.slice(0, minimumPlanCount))
type PlanViewMode = 'grid' | 'scroll' | 'condensed'
type SpendPresetId = 'healthy' | 'moderate' | 'worstCase'
const scenarioExamples = [
  'Example: We are planning for a pregnancy, a few specialist visits, and some lab work this year.',
  'Example: I’ll have a few doctor visits, maybe one specialist, and some lab work this year.',
  'Example: I go to therapy every other week and see a specialist a few times a year.',
]

function getNextScenarioExample() {
  return scenarioExamples[Math.floor(Math.random() * scenarioExamples.length)]
}

function getSpendPresets(coverageType: CoverageType): Array<{
  id: SpendPresetId
  label: string
  value: number
  description: string
}> {
  if (coverageType === 'family') {
    return [
      {
        id: 'healthy',
        label: 'Healthy',
        value: 1500,
        description: 'Preventative care and routine family visits.',
      },
      {
        id: 'moderate',
        label: 'Moderate',
        value: 12000,
        description: 'A few visits, testing, and one minor family procedure.',
      },
      {
        id: 'worstCase',
        label: 'Worst Case',
        value: 50000,
        description: 'Major family medical event that reaches\nthe out-of-pocket maximum.',
      },
    ]
  }

  return [
    {
      id: 'healthy',
      label: 'Healthy',
      value: 500,
      description: 'Preventative care only.',
    },
    {
      id: 'moderate',
      label: 'Moderate',
      value: 5000,
      description: 'A few visits and one minor procedure.',
    },
    {
      id: 'worstCase',
      label: 'Worst Case',
      value: 50000,
      description: 'Major medical event that reaches\nthe out-of-pocket maximum.',
    },
  ]
}

function handleInputFocus(event: FocusEvent<HTMLInputElement>) {
  event.target.select()
}

function handleInputClick(event: MouseEvent<HTMLInputElement>) {
  event.currentTarget.select()
}

function formatConfidence(confidence: number) {
  return `${Math.round(confidence * 100)}%`
}

function formatCurrency(value: number) {
  return `$${value.toLocaleString()}`
}

export default function App() {
  const [plans, setPlans] = useState<InsurancePlan[]>(initialPlans)
  const [scenarioPlaceholder] = useState(() => getNextScenarioExample())
  const [annualMedicalSpend, setAnnualMedicalSpend] = useState(5000)
  const [annualMedicalSpendDraft, setAnnualMedicalSpendDraft] = useState<string | null>(null)
  const [activeSpendPreset, setActiveSpendPreset] = useState<SpendPresetId | null>('moderate')
  const [activeSpendPresetTooltip, setActiveSpendPresetTooltip] = useState<SpendPresetId | null>(null)
  const [scenarioDescription, setScenarioDescription] = useState('')
  const [scenarioInterpretation, setScenarioInterpretation] =
    useState<ScenarioInterpretation | null>(null)
  const [scenarioError, setScenarioError] = useState<string | null>(null)
  const [isInterpretingScenario, setIsInterpretingScenario] = useState(false)
  const [coverageType, setCoverageType] = useState<CoverageType>('individual')
  const [planViewMode, setPlanViewMode] = useState<PlanViewMode>('scroll')
  const spendPresets = getSpendPresets(coverageType)
  const aiEstimatedSpend = scenarioInterpretation?.estimatedAnnualMedicalSpend ?? null
  const hasManualOverride =
    aiEstimatedSpend !== null && annualMedicalSpend !== aiEstimatedSpend
  const currentSpendSource = scenarioInterpretation
    ? hasManualOverride
      ? 'manual_override'
      : 'ai_estimate'
    : activeSpendPreset
      ? 'preset'
      : 'manual'

  const updatePlan = (
    index: number,
    field: keyof InsurancePlan,
    value: string | number,
  ) => {
    setScenarioError(null)
    setPlans((currentPlans) =>
      currentPlans.map((plan, planIndex) =>
        planIndex === index ? { ...plan, [field]: value } : plan,
      ),
    )
  }

  const addPlan = () => {
    setPlans((currentPlans) => {
      if (currentPlans.length >= maximumPlanCount) {
        return currentPlans
      }

      return [...currentPlans, structuredClone(defaultPlans[currentPlans.length])]
    })
  }

  const removePlan = (index: number) => {
    setPlans((currentPlans) =>
      currentPlans.length <= minimumPlanCount
        ? currentPlans
        : currentPlans.filter((_, planIndex) => planIndex !== index),
    )
  }

  const results = plans.map((plan) =>
    calculateAnnualCost(plan, annualMedicalSpend, coverageType),
  )
  const cheapestPlanIndex = getCheapestPlanIndex(results)
  const validations = plans.map((plan) => validatePlan(plan))
  const spendValidation = validateAnnualMedicalSpend(annualMedicalSpend)
  const hasValidationIssues =
    validations.some((validation) => validation.errors.length > 0) ||
    spendValidation.errors.length > 0
  const compactView = planViewMode === 'condensed'
  const condensedPlanLayoutStyle =
    planViewMode === 'condensed'
      ? { gridTemplateColumns: `repeat(${plans.length}, minmax(0, 1fr))` }
      : undefined
  const planLayoutClass =
    planViewMode === 'grid'
      ? 'grid gap-6 md:grid-cols-2'
      : planViewMode === 'condensed'
        ? 'grid gap-4'
        : 'grid min-w-max grid-flow-col gap-6'
  const planLayoutStyle =
    planViewMode === 'scroll'
      ? { gridAutoColumns: 'minmax(22rem, 1fr)' }
      : condensedPlanLayoutStyle

  const handleScenarioInterpretation = async () => {
    if (!scenarioDescription.trim()) {
      setScenarioError('Describe your expected healthcare year before running the consultant.')
      return
    }

    setIsInterpretingScenario(true)
    setScenarioError(null)

    try {
      const interpretation = await interpretScenario({
        userInput: scenarioDescription,
        coverageType,
        plans,
      })

      setScenarioInterpretation(interpretation)
      setAnnualMedicalSpend(interpretation.estimatedAnnualMedicalSpend)
      setAnnualMedicalSpendDraft(null)
      setActiveSpendPreset(null)
      setActiveSpendPresetTooltip(null)
    } catch (error) {
      setScenarioError(
        error instanceof Error
          ? error.message
          : 'Unable to interpret the scenario right now.',
      )
    } finally {
      setIsInterpretingScenario(false)
    }
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#e0f2fe,_#f8fafc_50%,_#e2e8f0)] px-4 py-10 text-slate-900">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8">
        <section className="rounded-[2rem] border border-white/60 bg-white/75 p-8 shadow-xl shadow-slate-200/60 backdrop-blur">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-sky-700">
            Insurance Plan Comparison
          </p>
          <h1 className="mt-4 max-w-3xl text-4xl font-bold tracking-tight text-slate-950">
            Find the Most Cost-Effective Plan for Your Year
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600">
            Enter your plan details and expected care to estimate your total annual
            costs.
          </p>

          <div className="mt-8 max-w-sm">
            <label
              className="mb-2 block text-sm font-medium text-slate-700"
              htmlFor="estimated-annual-medical-spend"
            >
              Estimated Annual Medical Spend
            </label>
            <div className="mb-4 flex flex-wrap gap-2">
              {spendPresets.map((preset) => (
                <div key={preset.id} className="relative">
                  <button
                    aria-describedby={
                      activeSpendPresetTooltip === preset.id ? `${preset.id}-preset-tooltip` : undefined
                    }
                    aria-label={`${preset.label}: ${preset.description}`}
                    aria-pressed={activeSpendPreset === preset.id}
                    className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${
                      activeSpendPreset === preset.id
                        ? 'border-sky-600 bg-sky-600 text-white'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-sky-300 hover:bg-sky-50'
                    }`}
                    tabIndex={-1}
                    type="button"
                    onBlur={() => setActiveSpendPresetTooltip(null)}
                    onClick={() => {
                      setScenarioError(null)
                      setAnnualMedicalSpend(preset.value)
                      setAnnualMedicalSpendDraft(null)
                      setActiveSpendPreset(preset.id)
                    }}
                    onFocus={() => setActiveSpendPresetTooltip(preset.id)}
                    onMouseEnter={() => setActiveSpendPresetTooltip(preset.id)}
                    onMouseLeave={() => setActiveSpendPresetTooltip(null)}
                  >
                    {preset.label}
                  </button>
                  <div
                    aria-hidden={activeSpendPresetTooltip !== preset.id}
                    aria-live="polite"
                    className={`absolute bottom-full left-1/2 z-10 mb-3 w-max -translate-x-1/2 whitespace-pre-line rounded-2xl border border-sky-100 bg-sky-50/95 px-3 py-2 text-center text-xs leading-5 text-slate-700 shadow-lg shadow-slate-200/50 backdrop-blur transition-opacity duration-150 ease-out ${
                      activeSpendPresetTooltip === preset.id
                        ? 'pointer-events-auto opacity-100'
                        : 'pointer-events-none opacity-0'
                    }`}
                    id={`${preset.id}-preset-tooltip`}
                    role={activeSpendPresetTooltip === preset.id ? 'tooltip' : undefined}
                  >
                    {preset.description}
                    <span className="absolute left-1/2 top-full h-3 w-3 -translate-x-1/2 -translate-y-1/2 rotate-45 border-b border-r border-sky-100 bg-sky-50/95" />
                  </div>
                </div>
              ))}
            </div>
            <input
              aria-label="Estimated Annual Medical Spend"
              aria-invalid={Boolean(spendValidation.fieldErrors.annualMedicalSpend)}
              className={`w-full rounded-2xl border bg-white px-4 py-3 text-lg text-slate-900 outline-none transition focus:border-sky-500 ${
                spendValidation.fieldErrors.annualMedicalSpend
                  ? 'border-rose-400 bg-rose-50'
                  : 'border-slate-200'
              }`}
              id="estimated-annual-medical-spend"
              min="0"
              step={annualMedicalSpendSliderStep}
              type="number"
              value={annualMedicalSpendDraft ?? annualMedicalSpend}
              onBlur={(event) => {
                setAnnualMedicalSpend(event.target.value === '' ? 0 : Number(event.target.value))
                setActiveSpendPreset(null)
                setAnnualMedicalSpendDraft(null)
                setScenarioError(null)
              }}
              onChange={(event) => {
                setAnnualMedicalSpendDraft(event.target.value)
                setActiveSpendPreset(null)
                setScenarioError(null)

                if (event.target.value !== '') {
                  setAnnualMedicalSpend(Number(event.target.value))
                }
              }}
              onClick={handleInputClick}
              onFocus={handleInputFocus}
            />
            <input
              aria-label="Estimated Annual Medical Spend Slider"
              className="mt-4 h-2 w-full cursor-pointer appearance-none rounded-full bg-sky-100 accent-sky-600"
              max={annualMedicalSpendSliderMax}
              min="0"
              step={annualMedicalSpendSliderStep}
              tabIndex={-1}
              type="range"
              value={Math.min(Math.max(annualMedicalSpend, 0), annualMedicalSpendSliderMax)}
              onChange={(event) => {
                const nextValue = Number(event.target.value)
                setAnnualMedicalSpend(nextValue)
                setActiveSpendPreset(
                  spendPresets.find((preset) => preset.value === nextValue)?.id ?? null,
                )
                setAnnualMedicalSpendDraft(String(nextValue))
              }}
              onMouseUp={() => setAnnualMedicalSpendDraft(null)}
              onTouchEnd={() => setAnnualMedicalSpendDraft(null)}
            />
            <div className="mt-2 flex justify-between text-xs font-medium text-slate-500">
              <span>$0</span>
              <span>${annualMedicalSpendSliderMax.toLocaleString()}</span>
            </div>
            {spendValidation.fieldErrors.annualMedicalSpend ? (
              <p className="mt-2 text-sm text-rose-600">
                {spendValidation.fieldErrors.annualMedicalSpend}
              </p>
            ) : null}
          </div>

          <div className="mt-6">
            <p className="mb-2 text-sm font-medium text-slate-700">Coverage Type</p>
            <div
              aria-label="Coverage type"
              className="inline-flex rounded-full border border-slate-200 bg-white p-1 shadow-sm"
              role="group"
            >
              {(['individual', 'family'] as CoverageType[]).map((type) => (
                <button
                  key={type}
                  aria-pressed={coverageType === type}
                  className={`rounded-full px-4 py-2 text-sm font-medium capitalize transition ${
                    coverageType === type
                      ? 'bg-sky-600 text-white'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                  tabIndex={-1}
                  type="button"
                  onClick={() => {
                    const nextCoverageType = type
                    const nextPresetValue =
                      activeSpendPreset === null
                        ? null
                        : getSpendPresets(nextCoverageType).find(
                            (preset) => preset.id === activeSpendPreset,
                          )?.value ?? null

                    setCoverageType(nextCoverageType)
                    setActiveSpendPresetTooltip(null)
                    setScenarioError(null)

                    if (nextPresetValue !== null) {
                      setAnnualMedicalSpend(nextPresetValue)
                      setAnnualMedicalSpendDraft(null)
                    }
                  }}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          {hasValidationIssues ? (
            <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              Review the highlighted fields. Totals still render using sanitized values,
              but these inputs should be corrected.
            </div>
          ) : null}
        </section>

        <section className="rounded-[2rem] border border-white/60 bg-white/75 p-8 shadow-xl shadow-slate-200/60 backdrop-blur">
          <div className="flex flex-col gap-3">
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-sky-700">
              AI Consultant
            </p>
            <h2 className="text-2xl font-semibold text-slate-950">
              Tell Us About Your Healthcare Needs This Year
            </h2>
            <p className="max-w-3xl text-sm leading-6 text-slate-600">
              Describe your situation in your own words. We&apos;ll turn it into a cost
              estimate using your plan details.
              <br />
              We do not store your medical or plan data in this app or on our server.
            </p>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(18rem,0.9fr)]">
            <div>
              <label
                className="mb-2 block text-sm font-medium text-slate-700"
                htmlFor="scenario-description"
              >
                Scenario Description
              </label>
              <textarea
                className="min-h-36 w-full rounded-3xl border border-slate-200 bg-white px-4 py-4 text-slate-900 outline-none transition focus:border-sky-500"
                id="scenario-description"
                placeholder={scenarioPlaceholder}
                value={scenarioDescription}
                onChange={(event) => {
                  setScenarioDescription(event.target.value)
                  setScenarioError(null)
                }}
              />
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button
                  className="rounded-full bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                  tabIndex={-1}
                  type="button"
                  disabled={isInterpretingScenario}
                  onClick={handleScenarioInterpretation}
                >
                  {isInterpretingScenario ? 'Creating Estimate...' : 'Create Estimate'}
                </button>
                <p className="text-xs leading-5 text-slate-500">{consultantDisclaimer}</p>
              </div>
              {scenarioError ? (
                <p className="mt-3 text-sm text-rose-600">{scenarioError}</p>
              ) : null}
            </div>

            <div className="rounded-3xl border border-slate-200 bg-slate-50/90 p-5">
              <p className="text-sm font-medium uppercase tracking-[0.2em] text-slate-500">
                Estimated Medical Spend
              </p>
              {scenarioInterpretation ? (
                <div className="mt-4 space-y-4 text-sm text-slate-700">
                  <div className="grid gap-3 rounded-3xl border border-slate-200 bg-white/80 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                          Scenario
                        </p>
                        <p className="mt-1 text-lg font-semibold text-slate-950">
                          {scenarioInterpretation.scenarioType.replace('_', ' ')}
                        </p>
                      </div>
                      <div className="rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold text-sky-700">
                        Confidence {formatConfidence(scenarioInterpretation.confidence)}
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                          AI Estimate
                        </p>
                        <p className="mt-1 text-base font-semibold text-slate-950">
                          {formatCurrency(scenarioInterpretation.estimatedAnnualMedicalSpend)}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                          Current Spend
                        </p>
                        <p className="mt-1 text-base font-semibold text-slate-950">
                          {formatCurrency(annualMedicalSpend)}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {currentSpendSource === 'ai_estimate'
                            ? 'Using the latest AI-estimated spend.'
                            : currentSpendSource === 'manual_override'
                              ? 'Using your current spend override in the calculator.'
                              : 'Using the current spend input.'}
                        </p>
                      </div>
                    </div>

                    {hasManualOverride ? (
                      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-3">
                        <div>
                          <p className="font-semibold text-amber-900">Manual override applied</p>
                          <p className="text-xs leading-5 text-amber-800">
                            You adjusted the AI-estimated spend manually. Totals below use
                            {` ${formatCurrency(annualMedicalSpend)} `}until you reapply the AI
                            estimate.
                          </p>
                        </div>
                        <button
                          className="rounded-full border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 transition hover:border-amber-400 hover:bg-amber-100"
                          tabIndex={-1}
                          type="button"
                          onClick={() => {
                            setAnnualMedicalSpend(scenarioInterpretation.estimatedAnnualMedicalSpend)
                            setAnnualMedicalSpendDraft(null)
                            setActiveSpendPreset(null)
                            setScenarioError(null)
                          }}
                        >
                          Reapply AI Estimate
                        </button>
                      </div>
                    ) : null}
                  </div>

                  <div>
                    <p className="font-semibold text-slate-900">Why this estimate</p>
                    <ul className="mt-2 list-disc pl-5 text-slate-600">
                      {scenarioInterpretation.assumptions.map((assumption) => (
                        <li key={assumption}>{assumption}</li>
                      ))}
                    </ul>
                  </div>
                  <p className="rounded-2xl border border-sky-100 bg-sky-50 px-3 py-2 text-xs leading-5 text-slate-600">
                    Financial simulation only. Not medical advice. Costs below are
                    computed by the insurance calculator using the current spend value,
                    and final costs still depend on insurer rules and actual claims
                    processing.
                  </p>
                </div>
              ) : (
                <p className="mt-4 text-sm leading-6 text-slate-600">
                  Describe your healthcare needs to see an estimated cost and breakdown.
                </p>
              )}
            </div>
          </div>
        </section>

        <section className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold text-slate-950">Plans</h2>
            <p className="mt-1 text-sm text-slate-600">
              Compare between {minimumPlanCount} and {maximumPlanCount} plans side by
              side.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-3">
            <div
              aria-label="Plan view mode"
              className="flex rounded-full border border-slate-200 bg-white p-1 shadow-sm"
              role="group"
            >
              {[
                ['grid', '2x2'],
                ['scroll', 'Scroll'],
                ['condensed', 'Condensed'],
              ].map(([mode, label]) => (
                <button
                  key={mode}
                  aria-pressed={planViewMode === mode}
                  className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
                    planViewMode === mode
                      ? 'bg-sky-600 text-white'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                  tabIndex={-1}
                  type="button"
                  onClick={() => setPlanViewMode(mode as PlanViewMode)}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              className="rounded-full bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              disabled={plans.length >= maximumPlanCount}
              tabIndex={-1}
              type="button"
              onClick={addPlan}
            >
              Add Plan
            </button>
          </div>
        </section>

        <section
          className={planViewMode === 'scroll' ? 'overflow-x-auto pb-2' : ''}
          data-testid="plan-layout"
        >
          <div className={planLayoutClass} style={planLayoutStyle}>
            {plans.map((plan, index) => (
              <PlanForm
                key={`${plan.name}-${index}`}
                coverageType={coverageType}
                compact={compactView}
                condensedFourUp={planViewMode === 'condensed' && plans.length === 4}
                fieldErrors={validations[index].fieldErrors}
                isCheaper={index === cheapestPlanIndex}
                plan={plan}
                title={`Plan ${index + 1}`}
                warnings={validations[index].warnings}
                onChange={(field, value) => updatePlan(index, field, value)}
                onRemove={
                  plans.length > minimumPlanCount ? () => removePlan(index) : undefined
                }
              />
            ))}
          </div>
        </section>

        <ComparisonResults
          activeSpend={annualMedicalSpend}
          chartMaxSpend={annualMedicalSpendSliderMax}
          coverageType={coverageType}
          plans={plans}
          results={results}
          viewMode={planViewMode}
        />
      </div>
    </main>
  )
}
