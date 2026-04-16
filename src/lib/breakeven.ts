import { calculateAnnualCost } from './insurance'
import type { CoverageType, InsurancePlan } from '../types/insurance'

const defaultMinSpend = 0
const defaultMaxSpend = 20000
const defaultStep = 100
const epsilon = 0.000001

export interface BreakEvenAnalysisPoint {
  spend: number
  costs: Record<string, number>
  cheapestPlanId: string
}

export interface BreakEvenPoint {
  planAId: string
  planBId: string
  spend: number
  costAtBreakEven: number | null
}

export interface ActiveSpendResult extends BreakEvenAnalysisPoint {}

export interface BreakEvenSummary {
  cheaperPlanId: string
  moreExpensivePlanId: string
  upToSpend: number
  afterSpend: number
  message: string
}

export interface BreakEvenAnalysisResult {
  points: BreakEvenAnalysisPoint[]
  breakEvenPoints: BreakEvenPoint[]
  activeSpendResult: ActiveSpendResult | null
  planIds: string[]
  planNamesById: Record<string, string>
}

export interface AnalyzeBreakEvenOptions {
  plans: InsurancePlan[]
  coverageType?: CoverageType
  minSpend?: number
  maxSpend?: number
  step?: number
  activeSpend?: number
}

interface NormalizedPlan {
  id: string
  name: string
  plan: InsurancePlan
}

function clampToZero(value: number) {
  return Number.isFinite(value) ? Math.max(0, value) : 0
}

function roundToCents(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function roundToWholeDollars(value: number) {
  return Math.round(value)
}

function sanitizeStep(step: number | undefined) {
  const normalizedStep = clampToZero(step ?? defaultStep)
  return normalizedStep > 0 ? normalizedStep : defaultStep
}

function sanitizeRange(
  minSpend: number | undefined,
  maxSpend: number | undefined,
  step: number,
) {
  const normalizedMin = clampToZero(minSpend ?? defaultMinSpend)
  const normalizedMax = clampToZero(maxSpend ?? defaultMaxSpend)

  if (normalizedMax < normalizedMin) {
    return {
      minSpend: normalizedMin,
      maxSpend: normalizedMin,
      step,
    }
  }

  return {
    minSpend: normalizedMin,
    maxSpend: normalizedMax,
    step,
  }
}

function slugifyPlanName(name: string) {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return slug || 'plan'
}

function normalizePlans(plans: InsurancePlan[]): NormalizedPlan[] {
  return plans.map((plan, index) => ({
    id: `${slugifyPlanName(plan.name)}-${index + 1}`,
    name: plan.name,
    plan,
  }))
}

function getCheapestPlanId(costs: Record<string, number>, planIds: string[]) {
  return planIds.reduce((cheapestPlanId, currentPlanId) =>
    costs[currentPlanId] < costs[cheapestPlanId] ? currentPlanId : cheapestPlanId,
  )
}

function buildPoint(
  plans: NormalizedPlan[],
  spend: number,
  coverageType: CoverageType,
): BreakEvenAnalysisPoint {
  const costs = Object.fromEntries(
    plans.map(({ id, plan }) => [id, calculateAnnualCost(plan, spend, coverageType).totalAnnualCost]),
  )

  return {
    spend,
    costs,
    cheapestPlanId: getCheapestPlanId(
      costs,
      plans.map(({ id }) => id),
    ),
  }
}

function buildSpendSeries(minSpend: number, maxSpend: number, step: number) {
  const points: number[] = []

  for (let spend = minSpend; spend <= maxSpend + epsilon; spend += step) {
    points.push(roundToCents(Math.min(spend, maxSpend)))
  }

  if (points.length === 0 || Math.abs(points[points.length - 1] - maxSpend) > epsilon) {
    points.push(roundToCents(maxSpend))
  }

  return [...new Set(points)]
}

function getDiff(
  point: BreakEvenAnalysisPoint,
  planAId: string,
  planBId: string,
) {
  return point.costs[planAId] - point.costs[planBId]
}

function interpolateBreakEvenSpend(
  leftPoint: BreakEvenAnalysisPoint,
  rightPoint: BreakEvenAnalysisPoint,
  planAId: string,
  planBId: string,
) {
  const leftDiff = getDiff(leftPoint, planAId, planBId)
  const rightDiff = getDiff(rightPoint, planAId, planBId)

  if (Math.abs(leftDiff) <= epsilon) {
    return leftPoint.spend
  }

  if (Math.abs(rightDiff) <= epsilon) {
    return rightPoint.spend
  }

  const spendDelta = rightPoint.spend - leftPoint.spend
  const diffDelta = rightDiff - leftDiff

  if (Math.abs(diffDelta) <= epsilon) {
    return null
  }

  const ratio = -leftDiff / diffDelta

  if (ratio < -epsilon || ratio > 1 + epsilon) {
    return null
  }

  return leftPoint.spend + spendDelta * ratio
}

function interpolateCostAtSpend(
  leftPoint: BreakEvenAnalysisPoint,
  rightPoint: BreakEvenAnalysisPoint,
  planId: string,
  spend: number,
) {
  const spendDelta = rightPoint.spend - leftPoint.spend

  if (Math.abs(spendDelta) <= epsilon) {
    return leftPoint.costs[planId]
  }

  const ratio = (spend - leftPoint.spend) / spendDelta
  return leftPoint.costs[planId] + (rightPoint.costs[planId] - leftPoint.costs[planId]) * ratio
}

function detectBreakEvenPoints(points: BreakEvenAnalysisPoint[], planIds: string[]) {
  const breakEvenPoints: BreakEvenPoint[] = []

  for (let leftPlanIndex = 0; leftPlanIndex < planIds.length; leftPlanIndex += 1) {
    for (
      let rightPlanIndex = leftPlanIndex + 1;
      rightPlanIndex < planIds.length;
      rightPlanIndex += 1
    ) {
      const planAId = planIds[leftPlanIndex]
      const planBId = planIds[rightPlanIndex]

      for (let pointIndex = 1; pointIndex < points.length; pointIndex += 1) {
        const leftPoint = points[pointIndex - 1]
        const rightPoint = points[pointIndex]
        const leftDiff = getDiff(leftPoint, planAId, planBId)
        const rightDiff = getDiff(rightPoint, planAId, planBId)

        const leftSign = Math.sign(Math.abs(leftDiff) <= epsilon ? 0 : leftDiff)
        const rightSign = Math.sign(Math.abs(rightDiff) <= epsilon ? 0 : rightDiff)

        if (leftSign === rightSign || (leftSign === 0 && rightSign === 0)) {
          continue
        }

        const spend = interpolateBreakEvenSpend(leftPoint, rightPoint, planAId, planBId)

        if (spend === null) {
          continue
        }

        const interpolatedCostA = interpolateCostAtSpend(leftPoint, rightPoint, planAId, spend)
        const interpolatedCostB = interpolateCostAtSpend(leftPoint, rightPoint, planBId, spend)
        const costAtBreakEven = roundToCents((interpolatedCostA + interpolatedCostB) / 2)
        const previousBreakEven = breakEvenPoints[breakEvenPoints.length - 1]

        if (
          previousBreakEven &&
          previousBreakEven.planAId === planAId &&
          previousBreakEven.planBId === planBId &&
          Math.abs(previousBreakEven.spend - spend) <= epsilon
        ) {
          continue
        }

        breakEvenPoints.push({
          planAId,
          planBId,
          spend: roundToCents(spend),
          costAtBreakEven,
        })
      }
    }
  }

  return breakEvenPoints
}

export function analyzeBreakEven({
  plans,
  coverageType = 'individual',
  minSpend = defaultMinSpend,
  maxSpend = defaultMaxSpend,
  step = defaultStep,
  activeSpend,
}: AnalyzeBreakEvenOptions): BreakEvenAnalysisResult {
  const normalizedPlans = normalizePlans(plans)
  const normalizedStep = sanitizeStep(step)
  const range = sanitizeRange(minSpend, maxSpend, normalizedStep)
  const spendSeries = buildSpendSeries(range.minSpend, range.maxSpend, range.step)
  const planIds = normalizedPlans.map(({ id }) => id)
  const planNamesById = Object.fromEntries(normalizedPlans.map(({ id, name }) => [id, name]))
  const points = spendSeries.map((spend) => buildPoint(normalizedPlans, spend, coverageType))
  const activeSpendResult =
    activeSpend === undefined
      ? null
      : buildPoint(normalizedPlans, clampToZero(activeSpend), coverageType)

  return {
    points,
    breakEvenPoints: detectBreakEvenPoints(points, planIds),
    activeSpendResult,
    planIds,
    planNamesById,
  }
}

export function summarizeBreakEven(
  analysis: BreakEvenAnalysisResult,
): BreakEvenSummary[] {
  return analysis.breakEvenPoints.map((breakEvenPoint) => {
    const pointIndex = analysis.points.findIndex(
      (point) => point.spend >= breakEvenPoint.spend - epsilon,
    )
    const nextPoint = analysis.points[Math.min(Math.max(pointIndex, 0), analysis.points.length - 1)]
    const cheaperPlanIdAfterBreakEven = nextPoint?.cheapestPlanId ?? breakEvenPoint.planBId
    const cheaperPlanNameAfterBreakEven =
      analysis.planNamesById[cheaperPlanIdAfterBreakEven] ?? cheaperPlanIdAfterBreakEven
    const cheaperPlanIdBeforeBreakEven =
      cheaperPlanIdAfterBreakEven === breakEvenPoint.planAId
        ? breakEvenPoint.planBId
        : breakEvenPoint.planAId
    const cheaperPlanNameBeforeBreakEven =
      analysis.planNamesById[cheaperPlanIdBeforeBreakEven] ?? cheaperPlanIdBeforeBreakEven
    const upToSpend = Math.max(0, roundToWholeDollars(breakEvenPoint.spend))

    return {
      cheaperPlanId: cheaperPlanIdAfterBreakEven,
      moreExpensivePlanId: cheaperPlanIdBeforeBreakEven,
      upToSpend,
      afterSpend: upToSpend,
      message: `${cheaperPlanNameBeforeBreakEven} is cheaper up to about $${upToSpend.toLocaleString()} in annual medical spend; after that, ${cheaperPlanNameAfterBreakEven} is cheaper.`,
    }
  })
}
