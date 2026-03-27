import { useState } from 'react'
import { ComparisonResults } from './components/ComparisonResults'
import { PlanForm } from './components/PlanForm'
import { defaultPlans } from './data/defaultPlans'
import { calculateAnnualCost, chooseCheaperPlan } from './lib/insurance'
import { validateAnnualMedicalSpend, validatePlan } from './lib/validation'
import type { InsurancePlan } from './types/insurance'

const initialPlans = structuredClone(defaultPlans)

export default function App() {
  const [plans, setPlans] = useState<InsurancePlan[]>(initialPlans)
  const [annualMedicalSpend, setAnnualMedicalSpend] = useState(5000)

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

  const leftResult = calculateAnnualCost(plans[0], annualMedicalSpend)
  const rightResult = calculateAnnualCost(plans[1], annualMedicalSpend)
  const cheaperPlan = chooseCheaperPlan(leftResult, rightResult)
  const leftIsCheaper = cheaperPlan === 'left'
  const rightIsCheaper = cheaperPlan === 'right'
  const leftValidation = validatePlan(plans[0])
  const rightValidation = validatePlan(plans[1])
  const spendValidation = validateAnnualMedicalSpend(annualMedicalSpend)
  const hasValidationIssues =
    leftValidation.errors.length > 0 ||
    rightValidation.errors.length > 0 ||
    spendValidation.errors.length > 0

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

        <section className="grid gap-6 xl:grid-cols-2">
          <PlanForm
            fieldErrors={leftValidation.fieldErrors}
            isCheaper={leftIsCheaper}
            plan={plans[0]}
            title="Plan 1"
            warnings={leftValidation.warnings}
            onChange={(field, value) => updatePlan(0, field, value)}
          />
          <PlanForm
            fieldErrors={rightValidation.fieldErrors}
            isCheaper={rightIsCheaper}
            plan={plans[1]}
            title="Plan 2"
            warnings={rightValidation.warnings}
            onChange={(field, value) => updatePlan(1, field, value)}
          />
        </section>

        <ComparisonResults
          leftPlan={plans[0]}
          leftResult={leftResult}
          rightPlan={plans[1]}
          rightResult={rightResult}
        />
      </div>
    </main>
  )
}
