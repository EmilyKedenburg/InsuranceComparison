import { describe, expect, it } from 'vitest'
import { validatePlan } from './validation'
import type { InsurancePlan } from '../types/insurance'

const basePlan: InsurancePlan = {
  name: 'Validation Plan',
  monthlyPremium: 250,
  individualDeductible: 1500,
  familyDeductible: 3000,
  coinsurance: 20,
  individualOutOfPocketMax: 5000,
  familyOutOfPocketMax: 10000,
  employerContribution: 1200,
}

describe('validatePlan', () => {
  it('warns when family deductible is lower than individual deductible', () => {
    const result = validatePlan({
      ...basePlan,
      familyDeductible: 1200,
    })

    expect(result.warnings).toContain(
      'Family deductible is lower than the individual deductible. Double-check this plan.',
    )
  })

  it('warns when family out-of-pocket max is lower than individual out-of-pocket max', () => {
    const result = validatePlan({
      ...basePlan,
      familyOutOfPocketMax: 4000,
    })

    expect(result.warnings).toContain(
      'Family out-of-pocket max is lower than the individual out-of-pocket max. Double-check this plan.',
    )
  })

  it('warns when family out-of-pocket max is lower than family deductible', () => {
    const result = validatePlan({
      ...basePlan,
      familyDeductible: 7000,
      familyOutOfPocketMax: 6500,
    })

    expect(result.warnings).toContain(
      'Family out-of-pocket max is lower than the deductible. Double-check this plan.',
    )
  })
})
