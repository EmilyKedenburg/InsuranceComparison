import type { AnnualCostBreakdown, InsurancePlan } from '../types/insurance'
import { getCheapestPlanIndex } from '../lib/insurance'

interface ComparisonResultsProps {
  plans: InsurancePlan[]
  results: AnnualCostBreakdown[]
  viewMode: 'grid' | 'scroll' | 'condensed'
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
  compact,
}: {
  label: string
  plan: InsurancePlan
  result: AnnualCostBreakdown
  highlighted: boolean
  compact: boolean
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
      <h3 className={`mt-2 font-semibold text-slate-900 ${compact ? 'text-xl' : 'text-2xl'}`}>
        {plan.name}
      </h3>
      <p className={`mt-4 font-bold text-slate-950 ${compact ? 'text-3xl' : 'text-4xl'}`}>
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
  plans,
  results,
  viewMode,
}: ComparisonResultsProps) {
  const cheapestPlanIndex = getCheapestPlanIndex(results)
  const sortedTotals = [...results]
    .map((result, index) => ({ result, index }))
    .sort((left, right) => left.result.totalAnnualCost - right.result.totalAnnualCost)
  const savings =
    sortedTotals.length > 1
      ? sortedTotals[1].result.totalAnnualCost - sortedTotals[0].result.totalAnnualCost
      : 0

  const compact = viewMode === 'condensed'
  const containerClass =
    viewMode === 'grid'
      ? 'grid gap-4 md:grid-cols-2'
      : viewMode === 'condensed'
        ? 'grid grid-cols-2 gap-4 xl:grid-cols-4'
        : 'grid min-w-max grid-flow-col gap-4'
  const containerStyle =
    viewMode === 'scroll' ? { gridAutoColumns: 'minmax(18rem, 1fr)' } : undefined

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
          {plans[cheapestPlanIndex].name} is currently the cheapest plan
          {sortedTotals.length > 1 ? ` by ${currencyFormatter.format(savings)}` : ''}.
        </p>
      </div>

      <div className={`mt-6 ${viewMode === 'scroll' ? 'overflow-x-auto pb-2' : ''}`}>
        <div className={containerClass} style={containerStyle}>
          {plans.map((plan, index) => (
            <SummaryCard
              key={`${plan.name}-${index}`}
              compact={compact}
              highlighted={index === cheapestPlanIndex}
              label={`Plan ${index + 1}`}
              plan={plan}
              result={results[index]}
            />
          ))}
        </div>
      </div>
    </section>
  )
}
