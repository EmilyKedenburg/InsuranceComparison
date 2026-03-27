import type { AnnualCostBreakdown, InsurancePlan } from '../types/insurance'
import { chooseCheaperPlan } from '../lib/insurance'

interface ComparisonResultsProps {
  leftPlan: InsurancePlan
  rightPlan: InsurancePlan
  leftResult: AnnualCostBreakdown
  rightResult: AnnualCostBreakdown
}

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

function SummaryCard({
  label,
  plan,
  result,
  highlighted,
}: {
  label: string
  plan: InsurancePlan
  result: AnnualCostBreakdown
  highlighted: boolean
}) {
  return (
    <article
      className={`rounded-3xl border p-6 ${
        highlighted
          ? 'border-emerald-400 bg-emerald-50'
          : 'border-slate-200 bg-slate-50'
      }`}
    >
      <p className="text-sm uppercase tracking-[0.2em] text-slate-500">{label}</p>
      <h3 className="mt-2 text-2xl font-semibold text-slate-900">{plan.name}</h3>
      <p className="mt-4 text-4xl font-bold text-slate-950">
        {currencyFormatter.format(result.totalAnnualCost)}
      </p>
      <div className="mt-5 space-y-2 text-sm text-slate-600">
        <p>Annual premium: {currencyFormatter.format(result.premiumCost)}</p>
        <p>Medical cost paid: {currencyFormatter.format(result.medicalCostPaid)}</p>
        <p>
          Employer contribution: -{currencyFormatter.format(result.employerContribution)}
        </p>
      </div>
    </article>
  )
}

export function ComparisonResults({
  leftPlan,
  rightPlan,
  leftResult,
  rightResult,
}: ComparisonResultsProps) {
  const cheaperPlan = chooseCheaperPlan(leftResult, rightResult)
  const savings = Math.abs(leftResult.totalAnnualCost - rightResult.totalAnnualCost)

  return (
    <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-6">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-slate-500">
          Annual Cost Comparison
        </p>
        <h2 className="text-2xl font-semibold text-slate-950">
          Based on your annual medical spend
        </h2>
        <p className="text-slate-600">
          {cheaperPlan === 'left' ? leftPlan.name : rightPlan.name} is currently cheaper
          by {currencyFormatter.format(savings)}.
        </p>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <SummaryCard
          highlighted={cheaperPlan === 'left'}
          label="Plan 1"
          plan={leftPlan}
          result={leftResult}
        />
        <SummaryCard
          highlighted={cheaperPlan === 'right'}
          label="Plan 2"
          plan={rightPlan}
          result={rightResult}
        />
      </div>
    </section>
  )
}
