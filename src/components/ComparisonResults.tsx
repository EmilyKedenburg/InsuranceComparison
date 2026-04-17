import type {
  AnnualCostBreakdown,
  CoverageType,
  InsurancePlan,
} from '../types/insurance'
import { getCheapestPlanIndex } from '../lib/insurance'
import { analyzeBreakEven, summarizeBreakEven } from '../lib/breakeven'

interface ComparisonResultsProps {
  plans: InsurancePlan[]
  results: AnnualCostBreakdown[]
  coverageType: CoverageType
  viewMode: 'grid' | 'scroll' | 'condensed'
  activeSpend: number
  chartMaxSpend?: number
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

function formatCompactCurrency(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value)
}

function getChartColor(index: number) {
  const palette = ['#0284c7', '#0f766e', '#ea580c', '#7c3aed']
  return palette[index % palette.length]
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
  activeSpend,
  chartMaxSpend = 20000,
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
  const breakEvenAnalysis = analyzeBreakEven({
    plans,
    coverageType,
    maxSpend: Math.max(chartMaxSpend, activeSpend),
    activeSpend,
  })
  const breakEvenSummaries = summarizeBreakEven(breakEvenAnalysis)
  const chartPoints = breakEvenAnalysis.points
  const chartHeight = 280
  const chartWidth = 760
  const chartPadding = { top: 20, right: 24, bottom: 40, left: 56 }
  const plotWidth = chartWidth - chartPadding.left - chartPadding.right
  const plotHeight = chartHeight - chartPadding.top - chartPadding.bottom
  const maxSpend = chartPoints[chartPoints.length - 1]?.spend ?? 0
  const allChartCosts = chartPoints.flatMap((point) => Object.values(point.costs))
  const maxCost = Math.max(...allChartCosts, ...Object.values(breakEvenAnalysis.activeSpendResult?.costs ?? {}), 0)
  const activeSpendResult = breakEvenAnalysis.activeSpendResult

  const getX = (spend: number) =>
    chartPadding.left + (maxSpend === 0 ? 0 : (spend / maxSpend) * plotWidth)
  const getY = (cost: number) =>
    chartPadding.top + plotHeight - (maxCost === 0 ? 0 : (cost / maxCost) * plotHeight)

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

      <div className="mt-6 rounded-[2rem] border border-slate-200 bg-slate-50/80 p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-slate-500">
              Break-Even Analysis
            </p>
            <h3 className="mt-1 text-xl font-semibold text-slate-950">
              How plan costs change across annual medical spend
            </h3>
          </div>
          <p className="text-sm text-slate-600">
            Active scenario: <span className="font-semibold text-slate-900">{formatCurrency(activeSpend)}</span>
            {activeSpendResult ? (
              <>
                {' '}
                and <span className="font-semibold text-emerald-700">{plans[breakEvenAnalysis.planIds.indexOf(activeSpendResult.cheapestPlanId)]?.name}</span> is cheapest there.
              </>
            ) : null}
          </p>
        </div>

        <div className="mt-5 overflow-x-auto">
          <div className="min-w-[44rem]">
            <svg
              aria-label="Break-even analysis chart"
              className="h-auto w-full"
              role="img"
              viewBox={`0 0 ${chartWidth} ${chartHeight}`}
            >
              <line
                stroke="#cbd5e1"
                strokeWidth="1"
                x1={chartPadding.left}
                x2={chartPadding.left}
                y1={chartPadding.top}
                y2={chartHeight - chartPadding.bottom}
              />
              <line
                stroke="#cbd5e1"
                strokeWidth="1"
                x1={chartPadding.left}
                x2={chartWidth - chartPadding.right}
                y1={chartHeight - chartPadding.bottom}
                y2={chartHeight - chartPadding.bottom}
              />

              {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
                const spendTick = maxSpend * ratio
                const y = chartPadding.top + plotHeight - plotHeight * ratio
                const spendX = getX(spendTick)
                const costTick = maxCost * ratio

                return (
                  <g key={ratio}>
                    <line
                      stroke="#e2e8f0"
                      strokeDasharray="4 6"
                      strokeWidth="1"
                      x1={chartPadding.left}
                      x2={chartWidth - chartPadding.right}
                      y1={y}
                      y2={y}
                    />
                    <text
                      fill="#64748b"
                      fontSize="11"
                      textAnchor="end"
                      x={chartPadding.left - 8}
                      y={y + 4}
                    >
                      {formatCompactCurrency(costTick)}
                    </text>
                    <text
                      fill="#64748b"
                      fontSize="11"
                      textAnchor="middle"
                      x={spendX}
                      y={chartHeight - 12}
                    >
                      {formatCompactCurrency(spendTick)}
                    </text>
                  </g>
                )
              })}

              {chartPoints.map((point) => {
                const x = getX(point.spend)
                return (
                  <line
                    key={`tick-${point.spend}`}
                    stroke="#f8fafc"
                    strokeWidth="1"
                    x1={x}
                    x2={x}
                    y1={chartPadding.top}
                    y2={chartHeight - chartPadding.bottom}
                  />
                )
              })}

              {plans.map((plan, index) => {
                const planId = breakEvenAnalysis.planIds[index]
                const color = getChartColor(index)
                const path = chartPoints
                  .map((point, pointIndex) => {
                    const command = pointIndex === 0 ? 'M' : 'L'
                    return `${command} ${getX(point.spend)} ${getY(point.costs[planId])}`
                  })
                  .join(' ')

                return (
                  <path
                    key={planId}
                    d={path}
                    fill="none"
                    stroke={color}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="3"
                  />
                )
              })}

              {breakEvenAnalysis.breakEvenPoints.map((breakEvenPoint, index) => {
                const x = getX(breakEvenPoint.spend)
                const y = getY(breakEvenPoint.costAtBreakEven ?? 0)

                return (
                  <g key={`${breakEvenPoint.planAId}-${breakEvenPoint.planBId}-${index}`}>
                    <circle cx={x} cy={y} fill="#0f172a" r="4" />
                    <text
                      fill="#0f172a"
                      fontSize="11"
                      textAnchor="middle"
                      x={x}
                      y={Math.max(14, y - 10)}
                    >
                      {formatCurrency(breakEvenPoint.spend)}
                    </text>
                  </g>
                )
              })}

              {activeSpendResult ? (
                <>
                  <line
                    stroke="#0f172a"
                    strokeDasharray="6 6"
                    strokeWidth="1.5"
                    x1={getX(activeSpendResult.spend)}
                    x2={getX(activeSpendResult.spend)}
                    y1={chartPadding.top}
                    y2={chartHeight - chartPadding.bottom}
                  />
                  {plans.map((plan, index) => {
                    const planId = breakEvenAnalysis.planIds[index]
                    const color = getChartColor(index)
                    return (
                      <circle
                        key={`active-${planId}`}
                        cx={getX(activeSpendResult.spend)}
                        cy={getY(activeSpendResult.costs[planId])}
                        fill={color}
                        r={activeSpendResult.cheapestPlanId === planId ? 6 : 4}
                        stroke="#ffffff"
                        strokeWidth="2"
                      />
                    )
                  })}
                </>
              ) : null}
            </svg>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          {plans.map((plan, index) => (
            <div
              key={`legend-${plan.name}-${index}`}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700"
            >
              <span
                aria-hidden="true"
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: getChartColor(index) }}
              />
              <span>{plan.name}</span>
            </div>
          ))}
        </div>

        {breakEvenSummaries.length > 0 ? (
          <div className="mt-4 space-y-2">
            {breakEvenSummaries.map((summary) => (
              <p
                key={`${summary.cheaperPlanId}-${summary.moreExpensivePlanId}-${summary.upToSpend}`}
                className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950"
              >
                {summary.message}
              </p>
            ))}
          </div>
        ) : (
          <p className="mt-4 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">
            No break-even crossover was detected in the displayed spend range.
          </p>
        )}
      </div>
    </section>
  )
}
