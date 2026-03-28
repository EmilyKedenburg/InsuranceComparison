import { describe, expect, it } from 'vitest'
import {
  calculateAnnualCost,
  calculateMedicalCostPaid,
  chooseCheaperPlan,
} from './insurance'
import type { InsurancePlan } from '../types/insurance'

const basePlan: InsurancePlan = {
  name: 'Test Plan',
  monthlyPremium: 250,
  individualDeductible: 1500,
  familyDeductible: 3000,
  coinsurance: 20,
  individualOutOfPocketMax: 5000,
  familyOutOfPocketMax: 10000,
  employerContribution: 1200,
}

describe('calculateMedicalCostPaid', () => {
  it('returns zero when medical spend is zero', () => {
    expect(calculateMedicalCostPaid(basePlan, 0)).toBe(0)
  })

  it('charges full spend when spend is below deductible', () => {
    expect(calculateMedicalCostPaid(basePlan, 900)).toBe(900)
  })

  it('applies coinsurance only after deductible is met', () => {
    expect(calculateMedicalCostPaid(basePlan, 3500)).toBe(1900)
  })

  it('applies coinsurance to spend just above the deductible', () => {
    expect(calculateMedicalCostPaid(basePlan, 1500.05)).toBe(1500.01)
  })

  it('caps user medical cost at out-of-pocket max', () => {
    expect(calculateMedicalCostPaid(basePlan, 25000)).toBe(5000)
  })

  it('handles spend exactly equal to deductible', () => {
    expect(calculateMedicalCostPaid(basePlan, 1500)).toBe(1500)
  })

  it('handles spend exactly equal to oop max threshold', () => {
    expect(calculateMedicalCostPaid(basePlan, 19000)).toBe(5000)
  })

  it('returns zero when the out-of-pocket maximum is zero', () => {
    const zeroMaxPlan: InsurancePlan = {
      ...basePlan,
      individualOutOfPocketMax: 0,
    }

    expect(calculateMedicalCostPaid(zeroMaxPlan, 6000)).toBe(0)
  })

  it('honors the out-of-pocket maximum even when it is below the deductible', () => {
    const lowMaxPlan: InsurancePlan = {
      ...basePlan,
      individualDeductible: 3000,
      individualOutOfPocketMax: 1200,
    }

    expect(calculateMedicalCostPaid(lowMaxPlan, 2000)).toBe(1200)
    expect(calculateMedicalCostPaid(lowMaxPlan, 10000)).toBe(1200)
  })

  it('clamps negative medical spend to zero', () => {
    expect(calculateMedicalCostPaid(basePlan, -250)).toBe(0)
  })

  it('treats NaN and Infinity medical spend as zero', () => {
    expect(calculateMedicalCostPaid(basePlan, Number.NaN)).toBe(0)
    expect(calculateMedicalCostPaid(basePlan, Number.POSITIVE_INFINITY)).toBe(0)
  })

  it('handles decimal or percentage inputs correctly', () => {
    const decimalPlan: InsurancePlan = {
      ...basePlan,
      individualDeductible: 1000,
      coinsurance: 12.5,
      individualOutOfPocketMax: 5000,
    }

    expect(calculateMedicalCostPaid(decimalPlan, 1800)).toBe(1100)
  })

  it('rounds medical cost paid to the nearest cent', () => {
    const roundingPlan: InsurancePlan = {
      ...basePlan,
      individualDeductible: 100,
      coinsurance: 50,
      individualOutOfPocketMax: 5000,
    }

    expect(calculateMedicalCostPaid(roundingPlan, 100.05)).toBe(100.03)
  })

  it('clamps negative deductible and negative coinsurance to zero', () => {
    const invalidCostSharingPlan: InsurancePlan = {
      ...basePlan,
      individualDeductible: -500,
      coinsurance: -10,
      individualOutOfPocketMax: 4000,
    }

    expect(calculateMedicalCostPaid(invalidCostSharingPlan, 3200)).toBe(0)
  })

  it('treats coinsurance as a percentage and clamps values above 100 percent', () => {
    const highCoinsurancePlan: InsurancePlan = {
      ...basePlan,
      individualDeductible: 1000,
      coinsurance: 150,
      individualOutOfPocketMax: 10000,
    }

    expect(calculateMedicalCostPaid(highCoinsurancePlan, 4000)).toBe(4000)
  })

  it('uses family deductible and out-of-pocket max when family coverage is selected', () => {
    expect(calculateMedicalCostPaid(basePlan, 3500, 'family')).toBe(3100)
  })

  it('returns zero when the family out-of-pocket maximum is zero', () => {
    const zeroFamilyMaxPlan: InsurancePlan = {
      ...basePlan,
      familyOutOfPocketMax: 0,
    }

    expect(calculateMedicalCostPaid(zeroFamilyMaxPlan, 6000, 'family')).toBe(0)
  })

  it('honors the family out-of-pocket maximum even when it is below the family deductible', () => {
    const lowFamilyMaxPlan: InsurancePlan = {
      ...basePlan,
      familyDeductible: 7000,
      familyOutOfPocketMax: 2500,
    }

    expect(calculateMedicalCostPaid(lowFamilyMaxPlan, 5000, 'family')).toBe(2500)
    expect(calculateMedicalCostPaid(lowFamilyMaxPlan, 15000, 'family')).toBe(2500)
  })

  it('handles spend exactly equal to the family deductible', () => {
    expect(calculateMedicalCostPaid(basePlan, 3000, 'family')).toBe(3000)
  })
})

describe('calculateAnnualCost', () => {
  it('includes annual premium, medical cost paid, and employer contribution', () => {
    expect(calculateAnnualCost(basePlan, 3500)).toEqual({
      medicalSpendInput: 3500,
      premiumCost: 3000,
      medicalCostPaid: 1900,
      employerContribution: 1200,
      totalAnnualCost: 3700,
    })
  })

  it('returns premium minus employer contribution when medical spend is 0', () => {
    expect(calculateAnnualCost(basePlan, 0).totalAnnualCost).toBe(1800)
  })

  it('clamps negative premium and employer contribution inputs to zero', () => {
    const invalidPlan: InsurancePlan = {
      ...basePlan,
      monthlyPremium: -100,
      employerContribution: -400,
    }

    expect(calculateAnnualCost(invalidPlan, 1000)).toEqual({
      medicalSpendInput: 1000,
      premiumCost: 0,
      medicalCostPaid: 1000,
      employerContribution: 0,
      totalAnnualCost: 1000,
    })
  })

  it('treats NaN and Infinity plan values as zero', () => {
    const nonFinitePlan: InsurancePlan = {
      ...basePlan,
      monthlyPremium: Number.NaN,
      individualDeductible: Number.POSITIVE_INFINITY,
      familyDeductible: Number.POSITIVE_INFINITY,
      coinsurance: Number.NaN,
      individualOutOfPocketMax: Number.POSITIVE_INFINITY,
      familyOutOfPocketMax: Number.POSITIVE_INFINITY,
      employerContribution: Number.POSITIVE_INFINITY,
    }

    expect(calculateAnnualCost(nonFinitePlan, Number.NaN)).toEqual({
      medicalSpendInput: 0,
      premiumCost: 0,
      medicalCostPaid: 0,
      employerContribution: 0,
      totalAnnualCost: 0,
    })
  })

  it('never returns a total cost below annual premium minus employer contribution unless intentionally allowed', () => {
    const result = calculateAnnualCost(basePlan, 8000)
    const baseline = basePlan.monthlyPremium * 12 - basePlan.employerContribution

    expect(result.totalAnnualCost).toBeGreaterThanOrEqual(baseline)
  })

  it('never returns a final annual cost below zero', () => {
    const heavilySubsidizedPlan: InsurancePlan = {
      ...basePlan,
      monthlyPremium: 100,
      employerContribution: 2500,
    }

    expect(calculateAnnualCost(heavilySubsidizedPlan, 0).totalAnnualCost).toBe(0)
  })

  it('rounds annual money values to the nearest cent', () => {
    const roundingPlan: InsurancePlan = {
      ...basePlan,
      monthlyPremium: 123.456,
      individualDeductible: 100,
      coinsurance: 50,
      employerContribution: 10.005,
    }

    expect(calculateAnnualCost(roundingPlan, 100.05)).toEqual({
      medicalSpendInput: 100.05,
      premiumCost: 1481.47,
      medicalCostPaid: 100.03,
      employerContribution: 10.01,
      totalAnnualCost: 1571.49,
    })
  })

  it('uses the selected family thresholds when calculating annual cost', () => {
    expect(calculateAnnualCost(basePlan, 3500, 'family')).toEqual({
      medicalSpendInput: 3500,
      premiumCost: 3000,
      medicalCostPaid: 3100,
      employerContribution: 1200,
      totalAnnualCost: 4900,
    })
  })
})

describe('chooseCheaperPlan', () => {
  it('chooses the cheaper plan correctly', () => {
    const moreExpensivePlan: InsurancePlan = {
      ...basePlan,
      name: 'More Expensive',
      monthlyPremium: 400,
      employerContribution: 200,
    }
    const cheaperPlan: InsurancePlan = {
      ...basePlan,
      name: 'Cheaper',
      monthlyPremium: 200,
      employerContribution: 1000,
    }

    const leftResult = calculateAnnualCost(moreExpensivePlan, 4000)
    const rightResult = calculateAnnualCost(cheaperPlan, 4000)

    expect(chooseCheaperPlan(leftResult, rightResult)).toBe('right')
  })

  it('treats a tie as the left plan winning by default', () => {
    const leftResult = calculateAnnualCost(basePlan, 5000)
    const rightResult = calculateAnnualCost(basePlan, 5000)

    expect(chooseCheaperPlan(leftResult, rightResult)).toBe('left')
  })
})
