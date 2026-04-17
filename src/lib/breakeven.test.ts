import { describe, expect, it } from 'vitest'
import {
  analyzeBreakEven,
  getMeaningfulMaxSpend,
  roundUpToNiceAxisValue,
  summarizeBreakEven,
  summarizeWinningRegions,
} from './breakeven'
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

describe('summarizeWinningRegions', () => {
  it('summarizes cheapest-plan regions instead of raw pairwise crossovers', () => {
    const analysis = analyzeBreakEven({
      plans: [ppoPlan, hdhpPlan],
      minSpend: 0,
      maxSpend: 20000,
      step: 100,
    })

    const summary = summarizeWinningRegions(
      analysis.points,
      analysis.breakEvenPoints,
      analysis.planNamesById,
      { maxSummaryRange: 20000, minRegionWidth: 500 },
    )

    expect(summary.regions).toHaveLength(2)
    expect(summary.summaryLines).toEqual([
      expect.stringMatching(/^HDHP Plan is cheapest up to about \$\d[\d,]* in annual medical spend\.$/),
      expect.stringMatching(/^PPO Plan is cheapest above about \$\d[\d,]*\.$/),
    ])
  })

  it('returns a full-range summary when one plan stays cheapest throughout the displayed range', () => {
    const analysis = analyzeBreakEven({
      plans: [alwaysCheaperPlan, alwaysExpensivePlan],
      minSpend: 0,
      maxSpend: 10000,
      step: 500,
    })

    const summary = summarizeWinningRegions(
      analysis.points,
      analysis.breakEvenPoints,
      analysis.planNamesById,
      { maxSummaryRange: 10000, minRegionWidth: 500 },
    )

    expect(summary.summaryLines).toEqual([
      'Always Cheap is cheapest across the full displayed range.',
    ])
  })

  it('merges extremely narrow regions that look like sampling jitter', () => {
    const summary = summarizeWinningRegions(
      [
        { spend: 0, costs: { a: 100, b: 200 }, cheapestPlanId: 'a' },
        { spend: 400, costs: { a: 150, b: 250 }, cheapestPlanId: 'a' },
        { spend: 450, costs: { a: 300, b: 200 }, cheapestPlanId: 'b' },
        { spend: 500, costs: { a: 140, b: 260 }, cheapestPlanId: 'a' },
        { spend: 1000, costs: { a: 180, b: 280 }, cheapestPlanId: 'a' },
      ],
      [
        { planAId: 'a', planBId: 'b', spend: 425, costAtBreakEven: 210 },
        { planAId: 'a', planBId: 'b', spend: 475, costAtBreakEven: 220 },
      ],
      { a: 'Plan A', b: 'Plan B' },
      { maxSummaryRange: 1000, minRegionWidth: 100 },
    )

    expect(summary.regions).toHaveLength(1)
    expect(summary.summaryLines).toEqual([
      'Plan A is cheapest across the full displayed range.',
    ])
  })
})

describe('meaningful chart range helpers', () => {
  it('rounds up to the next clean axis boundary', () => {
    expect(roundUpToNiceAxisValue(9750)).toBe(10000)
    expect(roundUpToNiceAxisValue(10800)).toBe(11000)
  })

  it('computes the default meaningful max from the highest individual oop max', () => {
    expect(
      getMeaningfulMaxSpend([
        { ...ppoPlan, individualOutOfPocketMax: 5000 },
        { ...hdhpPlan, individualOutOfPocketMax: 7000 },
        { ...alwaysExpensivePlan, individualOutOfPocketMax: 7800 },
      ]),
    ).toBe(10000)
  })
})
