import { useState } from 'react'
import type { FocusEvent, MouseEvent } from 'react'
import { ComparisonResults } from './components/ComparisonResults'
import { PlanForm } from './components/PlanForm'
import { defaultPlans } from './data/defaultPlans'
import { calculateAnnualCost, getCheapestPlanIndex } from './lib/insurance'
import { validateAnnualMedicalSpend, validatePlan } from './lib/validation'
import type { CoverageType, InsurancePlan } from './types/insurance'

const minimumPlanCount = 2
const maximumPlanCount = 4
const annualMedicalSpendSliderMax = 50000
const annualMedicalSpendSliderStep = 100
const initialPlans = structuredClone(defaultPlans.slice(0, minimumPlanCount))
type PlanViewMode = 'grid' | 'scroll' | 'condensed'
type SpendPresetId = 'healthy' | 'moderate' | 'worstCase'

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

export default function App() {
  const [plans, setPlans] = useState<InsurancePlan[]>(initialPlans)
  const [annualMedicalSpend, setAnnualMedicalSpend] = useState(5000)
  const [annualMedicalSpendDraft, setAnnualMedicalSpendDraft] = useState<string | null>(null)
  const [activeSpendPreset, setActiveSpendPreset] = useState<SpendPresetId | null>('moderate')
  const [activeSpendPresetTooltip, setActiveSpendPresetTooltip] = useState<SpendPresetId | null>(null)
  const [coverageType, setCoverageType] = useState<CoverageType>('individual')
  const [planViewMode, setPlanViewMode] = useState<PlanViewMode>('scroll')
  const spendPresets = getSpendPresets(coverageType)

  const updatePlan = (
    index: number,
    field: keyof InsurancePlan,
    value: string | number,
  ) => {
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

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#e0f2fe,_#f8fafc_50%,_#e2e8f0)] px-4 py-10 text-slate-900">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8">
        <section className="rounded-[2rem] border border-white/60 bg-white/75 p-8 shadow-xl shadow-slate-200/60 backdrop-blur">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-sky-700">
            Insurance Plan Comparison
          </p>
          <h1 className="mt-4 max-w-3xl text-4xl font-bold tracking-tight text-slate-950">
            Compare two plans by premium, deductible, coinsurance, and total annual
            cost.
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600">
            Enter plan details and estimate your annual medical spend. The
            calculation engine stays separate from the UI, so we can expand this into
            richer scenarios later without mixing business rules into components.
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
              }}
              onChange={(event) => {
                setAnnualMedicalSpendDraft(event.target.value)
                setActiveSpendPreset(null)

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
          coverageType={coverageType}
          plans={plans}
          results={results}
          viewMode={planViewMode}
        />
      </div>
    </main>
  )
}
