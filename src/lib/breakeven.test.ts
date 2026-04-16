import { describe, expect, it } from 'vitest'
import { analyzeBreakEven, summarizeBreakEven } from './breakeven'
import { calculateAnnualCost } from './insurance'
import type { InsurancePlan } from '../types/insurance'

const ppoPlan: InsurancePlan = {
  name: 'PPO Plan',
  monthlyPremium: 420,
  individualDeductible: 800,
  familyDeductible: 1600,
  coinsurance: 15,
  individualOutOfPocketMax: 3500,
  familyOutOfPocketMax: 7000,
  employerContribution: 0,
  hsaContribution: 0,
  hraContribution: 0,
}

const hdhpPlan: InsurancePlan = {
  name: 'HDHP Plan',
  monthlyPremium: 130,
  individualDeductible: 4000,
  familyDeductible: 8000,
  coinsurance: 45,
  individualOutOfPocketMax: 8500,
  familyOutOfPocketMax: 17000,
  employerContribution: 0,
  hsaContribution: 1200,
  hraContribution: 0,
}

const alwaysCheaperPlan: InsurancePlan = {
  name: 'Always Cheap',
  monthlyPremium: 100,
  individualDeductible: 0,
  familyDeductible: 0,
  coinsurance: 0,
  individualOutOfPocketMax: 0,
  familyOutOfPocketMax: 0,
  employerContribution: 0,
  hsaContribution: 0,
  hraContribution: 0,
}

const alwaysExpensivePlan: InsurancePlan = {
  name: 'Always Expensive',
  monthlyPremium: 500,
  individualDeductible: 2000,
  familyDeductible: 4000,
  coinsurance: 20,
  individualOutOfPocketMax: 5000,
  familyOutOfPocketMax: 10000,
  employerContribution: 0,
  hsaContribution: 0,
  hraContribution: 0,
}

describe('analyzeBreakEven', () => {
  it('produces chart points for the full configured spend range', () => {
    const analysis = analyzeBreakEven({
      plans: [ppoPlan, hdhpPlan],
      minSpend: 0,
      maxSpend: 500,
      step: 200,
    })

    expect(analysis.points.map((point) => point.spend)).toEqual([0, 200, 400, 500])
  })

  it('returns no break-even points when one plan is always cheaper', () => {
    const analysis = analyzeBreakEven({
      plans: [alwaysCheaperPlan, alwaysExpensivePlan],
      minSpend: 0,
      maxSpend: 10000,
      step: 500,
    })

    expect(analysis.breakEvenPoints).toEqual([])
    expect(new Set(analysis.points.map((point) => point.cheapestPlanId))).toEqual(
      new Set([analysis.planIds[0]]),
    )
  })

  it('identifies a break-even point when two plans cross', () => {
    const analysis = analyzeBreakEven({
      plans: [ppoPlan, hdhpPlan],
      minSpend: 0,
      maxSpend: 20000,
      step: 100,
    })

    const firstPoint = analysis.points[0]
    const lastPoint = analysis.points[analysis.points.length - 1]

    expect(firstPoint.cheapestPlanId).toBe(analysis.planIds[1])
    expect(lastPoint.cheapestPlanId).toBe(analysis.planIds[0])
    expect(analysis.breakEvenPoints).toHaveLength(1)
    expect(analysis.breakEvenPoints[0].spend).toBeGreaterThan(0)
    expect(analysis.breakEvenPoints[0].spend).toBeLessThan(20000)
    expect(analysis.breakEvenPoints[0].costAtBreakEven).not.toBeNull()
  })

  it('uses the real insurance cost engine instead of a simplified min spend formula', () => {
    const analysis = analyzeBreakEven({
      plans: [ppoPlan, hdhpPlan],
      minSpend: 3500,
      maxSpend: 3500,
      step: 100,
    })

    const point = analysis.points[0]
    const ppoPlanId = analysis.planIds[0]
    const engineCost = calculateAnnualCost(ppoPlan, 3500).totalAnnualCost
    const simplifiedCost =
      ppoPlan.monthlyPremium * 12 +
      Math.min(3500, ppoPlan.individualOutOfPocketMax) -
      ppoPlan.employerContribution

    expect(point.costs[ppoPlanId]).toBe(engineCost)
    expect(point.costs[ppoPlanId]).not.toBe(simplifiedCost)
  })

  it('matches activeSpendResult to the same canonical engine output as scenario results', () => {
    const activeSpend = 7250
    const analysis = analyzeBreakEven({
      plans: [ppoPlan, hdhpPlan],
      activeSpend,
    })

    const expectedPpoCost = calculateAnnualCost(ppoPlan, activeSpend).totalAnnualCost
    const expectedHdhpCost = calculateAnnualCost(hdhpPlan, activeSpend).totalAnnualCost

    expect(analysis.activeSpendResult).toEqual({
      spend: activeSpend,
      costs: {
        [analysis.planIds[0]]: expectedPpoCost,
        [analysis.planIds[1]]: expectedHdhpCost,
      },
      cheapestPlanId:
        expectedPpoCost <= expectedHdhpCost ? analysis.planIds[0] : analysis.planIds[1],
    })
  })
})

describe('summarizeBreakEven', () => {
  it('builds a readable summary for a detected break-even point', () => {
    const analysis = analyzeBreakEven({
      plans: [ppoPlan, hdhpPlan],
      minSpend: 0,
      maxSpend: 20000,
      step: 100,
    })

    const summaries = summarizeBreakEven(analysis)

    expect(summaries).toHaveLength(1)
    expect(summaries[0].message).toContain('annual medical spend')
  })
})
