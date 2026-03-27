import type { AnnualCostBreakdown, InsurancePlan } from '../types/insurance'

const clampToZero = (value: number) => (Number.isFinite(value) ? Math.max(0, value) : 0)
const roundToCents = (value: number) =>
  Math.round((value + Number.EPSILON) * 100) / 100

export function calculateMedicalCostPaid(
  plan: InsurancePlan,
  annualMedicalSpend: number,
): number {
  const spend = clampToZero(annualMedicalSpend)
  const deductible = clampToZero(plan.deductible)
  const outOfPocketMax = clampToZero(plan.outOfPocketMax)
  const coinsuranceRate = Math.min(Math.max(plan.coinsurance / 100, 0), 1)

  if (spend === 0 || outOfPocketMax === 0) {
    return 0
  }

  if (spend <= deductible) {
    return Math.min(spend, outOfPocketMax)
  }

  const remainingSpend = spend - deductible
  const totalPaidBeforeMax = deductible + remainingSpend * coinsuranceRate

  return roundToCents(Math.min(totalPaidBeforeMax, outOfPocketMax))
}

export function calculateAnnualCost(
  plan: InsurancePlan,
  annualMedicalSpend: number,
): AnnualCostBreakdown {
  const premiumCost = roundToCents(clampToZero(plan.monthlyPremium) * 12)
  const medicalCostPaid = calculateMedicalCostPaid(plan, annualMedicalSpend)
  const employerContribution = roundToCents(clampToZero(plan.employerContribution))

  return {
    medicalSpendInput: clampToZero(annualMedicalSpend),
    premiumCost,
    medicalCostPaid,
    employerContribution,
    totalAnnualCost: roundToCents(
      clampToZero(premiumCost + medicalCostPaid - employerContribution),
    ),
  }
}

export function chooseCheaperPlan(
  leftResult: AnnualCostBreakdown,
  rightResult: AnnualCostBreakdown,
): 'left' | 'right' {
  return leftResult.totalAnnualCost <= rightResult.totalAnnualCost ? 'left' : 'right'
}

export function getCheapestPlanIndex(results: AnnualCostBreakdown[]): number {
  return results.reduce(
    (lowestIndex, currentResult, currentIndex, allResults) =>
      currentResult.totalAnnualCost < allResults[lowestIndex].totalAnnualCost
        ? currentIndex
        : lowestIndex,
    0,
  )
}
