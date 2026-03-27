import { useState } from 'react'
import { ComparisonResults } from './components/ComparisonResults'
import { PlanForm } from './components/PlanForm'
import { defaultPlans } from './data/defaultPlans'
import { calculateAnnualCost, getCheapestPlanIndex } from './lib/insurance'
import { validateAnnualMedicalSpend, validatePlan } from './lib/validation'
import type { InsurancePlan } from './types/insurance'

const minimumPlanCount = 2
const maximumPlanCount = 4
const initialPlans = structuredClone(defaultPlans.slice(0, minimumPlanCount))
type PlanViewMode = 'grid' | 'scroll' | 'condensed'

export default function App() {
  const [plans, setPlans] = useState<InsurancePlan[]>(initialPlans)
  const [annualMedicalSpend, setAnnualMedicalSpend] = useState(5000)
  const [planViewMode, setPlanViewMode] = useState<PlanViewMode>('scroll')

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

  const results = plans.map((plan) => calculateAnnualCost(plan, annualMedicalSpend))
  const cheapestPlanIndex = getCheapestPlanIndex(results)
  const validations = plans.map((plan) => validatePlan(plan))
  const spendValidation = validateAnnualMedicalSpend(annualMedicalSpend)
  const hasValidationIssues =
    validations.some((validation) => validation.errors.length > 0) ||
    spendValidation.errors.length > 0
  const compactView = planViewMode === 'condensed'
  const planLayoutClass =
    planViewMode === 'grid'
      ? 'grid gap-6 md:grid-cols-2'
      : planViewMode === 'condensed'
        ? 'grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-4'
        : 'grid min-w-max grid-flow-col gap-6'
  const planLayoutStyle =
    planViewMode === 'scroll' ? { gridAutoColumns: 'minmax(22rem, 1fr)' } : undefined

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

          <label className="mt-8 block max-w-sm">
            <span className="mb-2 block text-sm font-medium text-slate-700">
              Annual Medical Spend
            </span>
            <input
              aria-invalid={Boolean(spendValidation.fieldErrors.annualMedicalSpend)}
              className={`w-full rounded-2xl border bg-white px-4 py-3 text-lg text-slate-900 outline-none transition focus:border-sky-500 ${
                spendValidation.fieldErrors.annualMedicalSpend
                  ? 'border-rose-400 bg-rose-50'
                  : 'border-slate-200'
              }`}
              min="0"
              step="100"
              type="number"
              value={annualMedicalSpend}
              onChange={(event) =>
                setAnnualMedicalSpend(
                  event.target.value === '' ? 0 : Number(event.target.value),
                )
              }
            />
            {spendValidation.fieldErrors.annualMedicalSpend ? (
              <p className="mt-2 text-sm text-rose-600">
                {spendValidation.fieldErrors.annualMedicalSpend}
              </p>
            ) : null}
          </label>

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
                compact={compactView}
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

        <ComparisonResults plans={plans} results={results} viewMode={planViewMode} />
      </div>
    </main>
  )
}
