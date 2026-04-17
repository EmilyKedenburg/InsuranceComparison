import { useEffect, useMemo, useState } from 'react'
import type {
  AnnualCostBreakdown,
  CoverageType,
  InsurancePlan,
} from '../types/insurance'
import { getCheapestPlanIndex } from '../lib/insurance'
import {
  analyzeBreakEven,
  defaultWinningRegionSummaryOptions,
  getMeaningfulMaxSpend,
  summarizeWinningRegions,
} from '../lib/breakeven'
import type { BreakEvenPoint } from '../lib/breakeven'

interface ComparisonResultsProps {
  plans: InsurancePlan[]
  results: AnnualCostBreakdown[]
  coverageType: CoverageType
  viewMode: 'grid' | 'scroll' | 'condensed'
  activeSpend: number
  chartMaxSpend?: number
  disclaimer?: string
}

type ChartRangeMode = 'typical' | 'extended'
type HoverTooltipState =
  | {
      type: 'breakEven'
      breakEvenPoint: BreakEvenPoint
      x: number
      y: number
      afterPlanId: string
    }
  | {
      type: 'activeSpend'
      x: number
      y: number
      planId: string
    }
  | null

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

function getChartRegionOpacity() {
  return 0.08
}

function getTooltipWidthFromContent(
  lines: string[],
  minWidth: number,
  maxWidth: number,
  characterWidth = 5.6,
  horizontalPadding = 12,
) {
  const contentWidth =
    Math.max(...lines.map((line) => line.length), 0) * characterWidth +
    horizontalPadding * 2

  return Math.max(minWidth, Math.min(maxWidth, contentWidth))
}

function getScaledRatio(value: number, maxValue: number) {
  if (maxValue <= 0) {
    return 0
  }

  return Math.sqrt(Math.max(0, Math.min(1, value / maxValue)))
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
        <p>Annual Premium: {formatCurrency(result.premiumCost)}</p>
        <p>Medical Cost Paid: {formatCurrency(result.medicalCostPaid)}</p>
        <p>HSA Contribution: -{formatCurrency(result.hsaContribution)}</p>
        <p>HRA Contribution: -{formatCurrency(result.hraContribution)}</p>
        <p>Adjusted Medical Cost: {formatCurrency(result.adjustedMedicalCost)}</p>
        <p>Employer Contribution: -{formatCurrency(result.employerContribution)}</p>
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
  disclaimer,
}: ComparisonResultsProps) {
  const [chartRangeMode, setChartRangeMode] = useState<ChartRangeMode>('typical')
  const [hasManualTypicalOverride, setHasManualTypicalOverride] = useState(false)
  const [hoverTooltip, setHoverTooltip] = useState<HoverTooltipState>(null)
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
  const meaningfulMaxSpend = getMeaningfulMaxSpend(plans)
  const activeSpendExceedsTypicalRange = activeSpend > meaningfulMaxSpend
  const displayMaxSpend = chartRangeMode === 'extended' ? 50000 : meaningfulMaxSpend
  const breakEvenAnalysis = analyzeBreakEven({
    plans,
    coverageType,
    maxSpend: Math.max(chartMaxSpend, 50000, activeSpend),
    activeSpend,
  })
  const chartPoints = useMemo(
    () => breakEvenAnalysis.points.filter((point) => point.spend <= displayMaxSpend),
    [breakEvenAnalysis.points, displayMaxSpend],
  )
  const chartHeight = 280
  const chartWidth = 760
  const chartPadding = { top: 20, right: 24, bottom: 40, left: 56 }
  const plotWidth = chartWidth - chartPadding.left - chartPadding.right
  const plotHeight = chartHeight - chartPadding.top - chartPadding.bottom
  const maxTooltipWidth = chartWidth - chartPadding.left - chartPadding.right - 16
  const maxSpend = displayMaxSpend
  const allChartCosts = chartPoints.flatMap((point) => Object.values(point.costs))
  const visibleBreakEvenPoints = useMemo(
    () => breakEvenAnalysis.breakEvenPoints.filter((point) => point.spend <= displayMaxSpend),
    [breakEvenAnalysis.breakEvenPoints, displayMaxSpend],
  )
  const winningRegionSummary = useMemo(
    () =>
      summarizeWinningRegions(chartPoints, visibleBreakEvenPoints, breakEvenAnalysis.planNamesById, {
        minRegionWidth: defaultWinningRegionSummaryOptions.minRegionWidth,
        roundingIncrement: defaultWinningRegionSummaryOptions.roundingIncrement,
        maxSummaryRange: displayMaxSpend,
      }),
    [chartPoints, visibleBreakEvenPoints, breakEvenAnalysis.planNamesById, displayMaxSpend],
  )
  const activeSpendClamped = chartRangeMode === 'typical' && activeSpendExceedsTypicalRange
  const activeSpendResult = breakEvenAnalysis.activeSpendResult
  const clampedActiveSpend = activeSpendClamped ? meaningfulMaxSpend : activeSpend
  const activeCheapestPlanIndex =
    activeSpendResult === null
      ? -1
      : breakEvenAnalysis.planIds.indexOf(activeSpendResult.cheapestPlanId)
  const maxCost = Math.max(
    ...allChartCosts,
    ...Object.values(breakEvenAnalysis.activeSpendResult?.costs ?? {}),
    0,
  )
  const xAxisTickRatios = [0, 0.05, 0.15, 0.35, 0.6, 1]
  const xAxisTicks = xAxisTickRatios.map((ratio) => ({
    spend: Math.round(maxSpend * ratio),
    x: chartPadding.left + getScaledRatio(maxSpend * ratio, maxSpend) * plotWidth,
  }))

  useEffect(() => {
    if (activeSpendExceedsTypicalRange) {
      if (!hasManualTypicalOverride) {
        setChartRangeMode('extended')
      }

      return
    }

    setChartRangeMode('typical')
    setHasManualTypicalOverride(false)
  }, [activeSpendExceedsTypicalRange, hasManualTypicalOverride])

  const getX = (spend: number) =>
    chartPadding.left + getScaledRatio(spend, maxSpend) * plotWidth
  const getY = (cost: number) =>
    chartPadding.top + plotHeight - (maxCost === 0 ? 0 : (cost / maxCost) * plotHeight)
  const getPlanName = (planId: string) =>
    breakEvenAnalysis.planNamesById[planId] ?? planId
  const getPlanIndex = (planId: string) => breakEvenAnalysis.planIds.indexOf(planId)
  const getBreakEvenAfterPlanId = (breakEvenPoint: BreakEvenPoint) => {
    const pointIndex = chartPoints.findIndex(
      (point) => point.spend >= breakEvenPoint.spend - 0.000001,
    )
    const nextPoint = chartPoints[Math.min(Math.max(pointIndex, 0), chartPoints.length - 1)]
    return nextPoint?.cheapestPlanId ?? breakEvenPoint.planBId
  }
  const getTooltipX = (anchorX: number, width: number) => {
    const preferredX = anchorX + 14
    const maxTooltipX = chartWidth - chartPadding.right - width

    if (preferredX <= maxTooltipX) {
      return Math.max(chartPadding.left, preferredX)
    }

    return Math.max(chartPadding.left, anchorX - width - 14)
  }
  const getBreakEvenTooltipY = (anchorY: number, height: number) => {
    const preferredTop = anchorY - height - 12

    if (preferredTop >= chartPadding.top) {
      return preferredTop
    }

    return Math.min(chartHeight - chartPadding.bottom - height, anchorY + 12)
  }
  const getMarkerTooltipY = (anchorY: number, height: number) => {
    const preferredTop = anchorY - height - 12

    if (preferredTop >= chartPadding.top) {
      return preferredTop
    }

    return Math.min(chartHeight - chartPadding.bottom - height, anchorY + 12)
  }

  const useFourUpSummaryLayout = viewMode === 'scroll' && plans.length === 4
  const compact = viewMode === 'condensed' || useFourUpSummaryLayout
  const containerClass =
    useFourUpSummaryLayout
      ? 'grid gap-4 lg:grid-cols-4'
      : viewMode === 'grid'
      ? 'grid gap-4 md:grid-cols-2'
      : viewMode === 'condensed'
        ? 'grid gap-4'
        : 'grid min-w-max grid-flow-col gap-4'
  const containerStyle =
    useFourUpSummaryLayout
      ? undefined
      : viewMode === 'scroll'
      ? { gridAutoColumns: 'minmax(18rem, 1fr)' }
      : viewMode === 'condensed'
        ? { gridTemplateColumns: `repeat(${plans.length}, minmax(0, 1fr))` }
        : undefined

  return (
    <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
      <div className="border-b border-slate-200 pb-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex-1">
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-slate-500">
              Annual Cost Comparison
            </p>
            <h2 className="mt-3 text-2xl font-semibold text-slate-950">
              Based on Your Annual Medical Spend
            </h2>
            <p className="mt-3 text-sm font-medium uppercase tracking-[0.2em] text-slate-500">
              {coverageType} coverage selected
            </p>
            <p className="mt-3 text-slate-600">
              {winningPlan.name} is currently the cheapest plan
              {sortedTotals.length > 1 ? ` by ${formatCurrency(savings)}` : ''}.
            </p>
          </div>
          {disclaimer ? (
            <p className="max-w-xl rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950 lg:ml-6 lg:flex-1">
              {disclaimer}
            </p>
          ) : null}
        </div>
        <div className="rounded-3xl border border-sky-100 bg-sky-50/70 p-4">
          <p className="text-sm font-semibold text-slate-900">Why this plan is cheaper</p>
          <ul className="mt-2 list-disc pl-5 text-sm leading-6 text-slate-600">
            {winnerExplanation.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </div>
      </div>

      <div className={`mt-6 ${viewMode === 'scroll' && !useFourUpSummaryLayout ? 'overflow-x-auto pb-2' : ''}`}>
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
              Compare Plan Costs Across Annual Medical Spend
            </h3>
          </div>
          <p className="text-sm text-slate-600">
            Active Scenario: <span className="font-semibold text-slate-900">{formatCurrency(activeSpend)}</span>
            {activeSpendResult ? (
              <>
                {' '}
                and{' '}
                <span
                  className="font-semibold"
                  style={{
                    color:
                      activeCheapestPlanIndex >= 0
                        ? getChartColor(activeCheapestPlanIndex)
                        : undefined,
                  }}
                >
                  {plans[activeCheapestPlanIndex]?.name}
                </span>{' '}
                is cheapest there.
              </>
            ) : null}
          </p>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <div
            aria-label="Chart range"
            className="inline-flex rounded-full border border-slate-200 bg-white p-1 shadow-sm"
            role="group"
          >
            <button
              aria-pressed={chartRangeMode === 'typical'}
              className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
                chartRangeMode === 'typical'
                  ? 'bg-sky-600 text-white'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
              tabIndex={-1}
              type="button"
              onClick={() => {
                setChartRangeMode('typical')
                setHasManualTypicalOverride(activeSpendExceedsTypicalRange)
              }}
            >
              Typical Range
            </button>
            <button
              aria-pressed={chartRangeMode === 'extended'}
              className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
                chartRangeMode === 'extended'
                  ? 'bg-sky-600 text-white'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
              tabIndex={-1}
              type="button"
              onClick={() => {
                setChartRangeMode('extended')
                setHasManualTypicalOverride(false)
              }}
            >
              Extended to $50K
            </button>
          </div>
          <p className="text-sm text-slate-500">
            Typical range focuses on spend up to {formatCurrency(meaningfulMaxSpend)}.
          </p>
        </div>

        {activeSpendClamped ? (
          <p className="mt-3 inline-flex rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
            Your active scenario is above the typical chart range, so its marker is pinned to the
            right edge. Switch to Extended to see its full spend position.
          </p>
        ) : null}

        <p className="mt-3 inline-flex rounded-2xl border border-sky-200 bg-sky-50 px-3 py-2 text-sm font-medium text-sky-900 shadow-sm shadow-sky-100/60">
          Hover over any break-even point or annual spend marker to see its details. Shaded
          regions show which plan is cheapest across each spend range.
        </p>

        <div className="mt-5">
          <div className="w-full">
            <svg
              aria-label="Break-even analysis chart"
              className="h-auto w-full"
              role="img"
              viewBox={`0 0 ${chartWidth} ${chartHeight}`}
            >
              {winningRegionSummary.regions.map((region) => {
                const planIndex = getPlanIndex(region.planId)
                const startSpend = Math.max(0, region.startSpend)
                const endSpend = Math.min(displayMaxSpend, region.endSpend ?? displayMaxSpend)

                if (planIndex < 0 || endSpend <= startSpend) {
                  return null
                }

                return (
                  <rect
                    key={`${region.planId}-${region.startSpend}-${region.endSpend ?? 'max'}`}
                    fill={getChartColor(planIndex)}
                    fillOpacity={getChartRegionOpacity()}
                    height={plotHeight}
                    width={Math.max(0, getX(endSpend) - getX(startSpend))}
                    x={getX(startSpend)}
                    y={chartPadding.top}
                  />
                )
              })}

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
                const y = chartPadding.top + plotHeight - plotHeight * ratio
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
                  </g>
                )
              })}

              {xAxisTicks.map((tick) => (
                <text
                  key={`x-axis-${tick.spend}`}
                  fill="#64748b"
                  fontSize="11"
                  textAnchor="middle"
                  x={tick.x}
                  y={chartHeight - 12}
                >
                  {formatCompactCurrency(tick.spend)}
                </text>
              ))}

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

              {visibleBreakEvenPoints.map((breakEvenPoint, index) => {
                const x = getX(breakEvenPoint.spend)
                const y = getY(breakEvenPoint.costAtBreakEven ?? 0)
                const isHovered =
                  hoverTooltip?.type === 'breakEven' &&
                  hoverTooltip.breakEvenPoint.planAId === breakEvenPoint.planAId &&
                  hoverTooltip.breakEvenPoint.planBId === breakEvenPoint.planBId &&
                  hoverTooltip.breakEvenPoint.spend === breakEvenPoint.spend

                return (
                  <g
                    key={`${breakEvenPoint.planAId}-${breakEvenPoint.planBId}-${index}`}
                    onBlur={() =>
                      setHoverTooltip((current) =>
                        current?.type === 'breakEven' ? null : current,
                      )
                    }
                    onFocus={() =>
                      setHoverTooltip({
                        type: 'breakEven',
                        breakEvenPoint,
                        x,
                        y,
                        afterPlanId: getBreakEvenAfterPlanId(breakEvenPoint),
                      })
                    }
                    onMouseEnter={() =>
                      setHoverTooltip({
                        type: 'breakEven',
                        breakEvenPoint,
                        x,
                        y,
                        afterPlanId: getBreakEvenAfterPlanId(breakEvenPoint),
                      })
                    }
                    onMouseLeave={() =>
                      setHoverTooltip((current) =>
                        current?.type === 'breakEven' ? null : current,
                      )
                    }
                  >
                    <circle
                      cx={x}
                      cy={y}
                      fill="#0f172a"
                      r={isHovered ? 5 : 4}
                      tabIndex={0}
                    />
                  </g>
                )
              })}

              {activeSpendResult ? (
                <>
                  <line
                    stroke="#0f172a"
                    strokeDasharray="6 6"
                    strokeWidth="1.5"
                    x1={getX(clampedActiveSpend)}
                    x2={getX(clampedActiveSpend)}
                    y1={chartPadding.top}
                    y2={chartHeight - chartPadding.bottom}
                  />
                  {plans
                    .map((plan, index) => ({
                      index,
                      planId: breakEvenAnalysis.planIds[index],
                    }))
                    .sort((left, right) => {
                      const leftIsCheapest = activeSpendResult.cheapestPlanId === left.planId
                      const rightIsCheapest = activeSpendResult.cheapestPlanId === right.planId

                      if (leftIsCheapest === rightIsCheapest) {
                        return left.index - right.index
                      }

                      return leftIsCheapest ? 1 : -1
                    })
                    .map(({ index, planId }) => {
                      const color = getChartColor(index)
                      return (
                        <circle
                          key={`active-${planId}`}
                          cx={getX(clampedActiveSpend)}
                          cy={getY(activeSpendResult.costs[planId])}
                          fill={color}
                          onBlur={() =>
                            setHoverTooltip((current) =>
                              current?.type === 'activeSpend' ? null : current,
                            )
                          }
                          onFocus={() =>
                            setHoverTooltip({
                              type: 'activeSpend',
                              x: getX(clampedActiveSpend),
                              y: getY(activeSpendResult.costs[planId]),
                              planId,
                            })
                          }
                          onMouseEnter={() =>
                            setHoverTooltip({
                              type: 'activeSpend',
                              x: getX(clampedActiveSpend),
                              y: getY(activeSpendResult.costs[planId]),
                              planId,
                            })
                          }
                          onMouseLeave={() =>
                            setHoverTooltip((current) =>
                              current?.type === 'activeSpend' ? null : current,
                            )
                          }
                          r={activeSpendResult.cheapestPlanId === planId ? 6 : 4}
                          stroke="#ffffff"
                          strokeWidth="2"
                          tabIndex={0}
                        />
                      )
                  })}
                </>
              ) : null}

              {hoverTooltip?.type === 'breakEven' ? (
                (() => {
                  const tooltipPaddingX = 12
                  const afterPlanName = getPlanName(hoverTooltip.afterPlanId)
                  const beforePlanId =
                    hoverTooltip.afterPlanId === hoverTooltip.breakEvenPoint.planAId
                      ? hoverTooltip.breakEvenPoint.planBId
                      : hoverTooltip.breakEvenPoint.planAId
                  const beforePlanName = getPlanName(beforePlanId)
                  const tooltipLines = [
                    `Break-Even Near ${formatCurrency(hoverTooltip.breakEvenPoint.spend)}`,
                    `${beforePlanName} and ${afterPlanName}`,
                    `${afterPlanName} becomes cheaper after this point.`,
                  ]
                  const tooltipWidth = getTooltipWidthFromContent(
                    tooltipLines,
                    0,
                    maxTooltipWidth,
                    5.9,
                    tooltipPaddingX,
                  )
                  const tooltipHeight = 72
                  const tooltipX = getTooltipX(hoverTooltip.x, tooltipWidth)
                  const tooltipY = getBreakEvenTooltipY(hoverTooltip.y, tooltipHeight)

                  return (
                    <g pointerEvents="none">
                      <rect
                        fill="rgba(15, 23, 42, 0.96)"
                        height={tooltipHeight}
                        rx="16"
                        width={tooltipWidth}
                        x={tooltipX}
                        y={tooltipY}
                      />
                      <text
                        fill="#ffffff"
                        fontSize="12"
                        fontWeight="600"
                        x={tooltipX + tooltipPaddingX}
                        y={tooltipY + 22}
                      >
                        Break-Even Near {formatCurrency(hoverTooltip.breakEvenPoint.spend)}
                      </text>
                      <text
                        fill="#cbd5e1"
                        fontSize="11"
                        x={tooltipX + tooltipPaddingX}
                        y={tooltipY + 40}
                      >
                        {beforePlanName} and {afterPlanName}
                      </text>
                      <text
                        fill="#ffffff"
                        fontSize="11"
                        x={tooltipX + tooltipPaddingX}
                        y={tooltipY + 58}
                      >
                        {afterPlanName} becomes cheaper after this point.
                      </text>
                    </g>
                  )
                })()
              ) : null}

              {hoverTooltip?.type === 'activeSpend' && activeSpendResult ? (
                (() => {
                  const tooltipPaddingX = 12
                  const planName = getPlanName(hoverTooltip.planId)
                  const isCheapest = activeSpendResult.cheapestPlanId === hoverTooltip.planId
                  const tooltipLines = [
                    `Annual Spend: ${formatCurrency(activeSpend)}`,
                    `${planName}: ${formatCurrency(activeSpendResult.costs[hoverTooltip.planId])}`,
                    isCheapest
                      ? `${planName} is cheapest at this spend.`
                      : `${planName} is not the cheapest here.`,
                  ]
                  const tooltipWidth = getTooltipWidthFromContent(
                    tooltipLines,
                    0,
                    maxTooltipWidth,
                    5.5,
                    tooltipPaddingX,
                  )
                  const tooltipHeight = 66
                  const tooltipX = getTooltipX(hoverTooltip.x, tooltipWidth)
                  const tooltipY = getMarkerTooltipY(hoverTooltip.y, tooltipHeight)

                  return (
                    <g pointerEvents="none">
                      <rect
                        fill="rgba(15, 23, 42, 0.96)"
                        height={tooltipHeight}
                        rx="16"
                        width={tooltipWidth}
                        x={tooltipX}
                        y={tooltipY}
                      />
                      <text
                        fill="#ffffff"
                        fontSize="11"
                        fontWeight="600"
                        x={tooltipX + tooltipPaddingX}
                        y={tooltipY + 20}
                      >
                        Annual Spend: {formatCurrency(activeSpend)}
                      </text>
                      <text
                        fill="#cbd5e1"
                        fontSize="10"
                        x={tooltipX + tooltipPaddingX}
                        y={tooltipY + 36}
                      >
                        {planName}: {formatCurrency(activeSpendResult.costs[hoverTooltip.planId])}
                      </text>
                      <text
                        fill="#ffffff"
                        fontSize="10"
                        x={tooltipX + tooltipPaddingX}
                        y={tooltipY + 52}
                      >
                        {isCheapest ? `${planName} is cheapest at this spend.` : `${planName} is not the cheapest here.`}
                      </text>
                    </g>
                  )
                })()
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

        {winningRegionSummary.summaryLines.length > 0 ? (
          <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-slate-950 marker:text-slate-950">
            {winningRegionSummary.summaryLines.map((summaryLine) => (
              <li key={summaryLine}>
                {summaryLine}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">
            No break-even crossover was detected in the displayed spend range.
          </p>
        )}
      </div>
    </section>
  )
}
