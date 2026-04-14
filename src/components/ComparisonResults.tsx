import type {
  AnnualCostBreakdown,
  CoverageType,
  InsurancePlan,
} from '../types/insurance'
import { getCheapestPlanIndex } from '../lib/insurance'

interface ComparisonResultsProps {
  plans: InsurancePlan[]
  results: AnnualCostBreakdown[]
  coverageType: CoverageType
  viewMode: 'grid' | 'scroll' | 'condensed'
}

const wholeDollarFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

const centsFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

function formatCurrency(value: number) {
  const roundedValue = Math.round((value + Number.EPSILON) * 100) / 100
  return Number.isInteger(roundedValue)
    ? wholeDollarFormatter.format(roundedValue)
    : centsFormatter.format(roundedValue)
}

function getCurrentDeductible(plan: InsurancePlan, coverageType: CoverageType) {
  return coverageType === 'family' ? plan.familyDeductible : plan.individualDeductible
}

function buildWinnerExplanation(
  winnerPlan: InsurancePlan,
  winnerResult: AnnualCostBreakdown,
  runnerUpPlan: InsurancePlan | undefined,
  runnerUpResult: AnnualCostBreakdown | undefined,
  coverageType: CoverageType,
) {
  if (!runnerUpPlan || !runnerUpResult) {
    return [`${winnerPlan.name} is the only plan to compare, so it is currently the cheapest option.`]
  }

  const reasons: string[] = []
  const premiumDifference = runnerUpResult.premiumCost - winnerResult.premiumCost
  const employerDifference =
    winnerResult.employerContribution - runnerUpResult.employerContribution
  const adjustedMedicalDifference =
    runnerUpResult.adjustedMedicalCost - winnerResult.adjustedMedicalCost
  const winnerDeductible = getCurrentDeductible(winnerPlan, coverageType)
  const runnerUpDeductible = getCurrentDeductible(runnerUpPlan, coverageType)

  if (premiumDifference > 0) {
    reasons.push(
      `${winnerPlan.name} has a lower annual premium by ${formatCurrency(premiumDifference)}.`,
    )
  }

  if (employerDifference > 0) {
    reasons.push(
      `${winnerPlan.name} gets ${formatCurrency(employerDifference)} more employer contribution.`,
    )
  }

  if (adjustedMedicalDifference > 0) {
    reasons.push(
      `${winnerPlan.name} has a lower adjusted medical cost in this scenario by ${formatCurrency(adjustedMedicalDifference)}.`,
    )
  }

  if (winnerDeductible > runnerUpDeductible && premiumDifference > 0) {
    reasons.push('Its higher deductible did not outweigh the premium savings in this scenario.')
  }

  if (winnerDeductible < runnerUpDeductible && adjustedMedicalDifference > 0) {
    reasons.push('Its lower deductible helped reduce what you pay for care at this spend level.')
  }

  if (reasons.length === 0) {
    reasons.push(
      `${winnerPlan.name} ends up with the lowest total annual cost after premiums, employer funding, and out-of-pocket costs are combined.`,
    )
  }

  return reasons.slice(0, 3)
}

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
        {formatCurrency(result.totalAnnualCost)}
      </p>
      <div className="mt-5 space-y-2 text-sm text-slate-600">
        <p>Annual premium: {formatCurrency(result.premiumCost)}</p>
        <p>Medical cost paid: {formatCurrency(result.medicalCostPaid)}</p>
        <p>HSA contribution: -{formatCurrency(result.hsaContribution)}</p>
        <p>HRA contribution: -{formatCurrency(result.hraContribution)}</p>
        <p>Adjusted medical cost: {formatCurrency(result.adjustedMedicalCost)}</p>
        <p>Employer contribution: -{formatCurrency(result.employerContribution)}</p>
      </div>
    </article>
  )
}

export function ComparisonResults({
  plans,
  results,
  coverageType,
  viewMode,
}: ComparisonResultsProps) {
  const cheapestPlanIndex = getCheapestPlanIndex(results)
  const winningPlan = plans[cheapestPlanIndex]
  const winningResult = results[cheapestPlanIndex]
  const sortedTotals = [...results]
    .map((result, index) => ({ result, index }))
    .sort((left, right) => left.result.totalAnnualCost - right.result.totalAnnualCost)
  const runnerUpIndex = sortedTotals[1]?.index
  const winnerExplanation = buildWinnerExplanation(
    winningPlan,
    winningResult,
    runnerUpIndex === undefined ? undefined : plans[runnerUpIndex],
    runnerUpIndex === undefined ? undefined : results[runnerUpIndex],
    coverageType,
  )
  const savings =
    sortedTotals.length > 1
      ? sortedTotals[1].result.totalAnnualCost - sortedTotals[0].result.totalAnnualCost
      : 0

  const compact = viewMode === 'condensed'
  const containerClass =
    viewMode === 'grid'
      ? 'grid gap-4 md:grid-cols-2'
      : viewMode === 'condensed'
        ? 'grid gap-4'
        : 'grid min-w-max grid-flow-col gap-4'
  const containerStyle =
    viewMode === 'scroll'
      ? { gridAutoColumns: 'minmax(18rem, 1fr)' }
      : viewMode === 'condensed'
        ? { gridTemplateColumns: `repeat(${plans.length}, minmax(0, 1fr))` }
        : undefined

  return (
    <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-6">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-slate-500">
          Annual Cost Comparison
        </p>
        <h2 className="text-2xl font-semibold text-slate-950">
          Based on your annual medical spend
        </h2>
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-slate-500">
          {coverageType} coverage selected
        </p>
        <p className="text-slate-600">
          {winningPlan.name} is currently the cheapest plan
          {sortedTotals.length > 1 ? ` by ${formatCurrency(savings)}` : ''}.
        </p>
        <div className="rounded-3xl border border-sky-100 bg-sky-50/70 p-4">
          <p className="text-sm font-semibold text-slate-900">Why this plan is cheaper</p>
          <ul className="mt-2 list-disc pl-5 text-sm leading-6 text-slate-600">
            {winnerExplanation.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </div>
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
