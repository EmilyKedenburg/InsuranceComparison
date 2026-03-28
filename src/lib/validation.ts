import type { InsurancePlan } from '../types/insurance'

export interface ValidationResult {
  errors: string[]
  warnings: string[]
  fieldErrors: Partial<Record<keyof InsurancePlan | 'annualMedicalSpend', string>>
}

function isFiniteNumber(value: number) {
  return Number.isFinite(value)
}

export function validatePlan(plan: InsurancePlan): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []
  const fieldErrors: ValidationResult['fieldErrors'] = {}

  if (!plan.name.trim()) {
    fieldErrors.name = 'Plan name is required.'
    errors.push(fieldErrors.name)
  }

  const numericChecks: Array<{
    key: Exclude<keyof InsurancePlan, 'name' | 'coinsurance' | 'accountContributionType'>
    label: string
  }> = [
    { key: 'monthlyPremium', label: 'Monthly premium' },
    { key: 'individualDeductible', label: 'Individual deductible' },
    { key: 'familyDeductible', label: 'Family deductible' },
    { key: 'individualOutOfPocketMax', label: 'Individual out-of-pocket max' },
    { key: 'familyOutOfPocketMax', label: 'Family out-of-pocket max' },
    { key: 'employerContribution', label: 'Employer contribution' },
    { key: 'hsaHraContribution', label: 'HSA/HRA contribution' },
  ]

  for (const check of numericChecks) {
    const value = plan[check.key]

    if (!isFiniteNumber(value)) {
      const message = `${check.label} must be a valid number.`
      fieldErrors[check.key] = message
      errors.push(message)
      continue
    }

    if (value < 0) {
      const message = `${check.label} cannot be negative.`
      fieldErrors[check.key] = message
      errors.push(message)
    }
  }

  if (!isFiniteNumber(plan.coinsurance)) {
    fieldErrors.coinsurance = 'Coinsurance must be a valid percentage.'
    errors.push(fieldErrors.coinsurance)
  } else if (plan.coinsurance < 0 || plan.coinsurance > 100) {
    fieldErrors.coinsurance = 'Coinsurance must be between 0 and 100.'
    errors.push(fieldErrors.coinsurance)
  }

  if (
    isFiniteNumber(plan.individualDeductible) &&
    isFiniteNumber(plan.individualOutOfPocketMax) &&
    plan.individualDeductible > 0 &&
    plan.individualOutOfPocketMax > 0 &&
    plan.individualOutOfPocketMax < plan.individualDeductible
  ) {
    warnings.push(
      'Individual out-of-pocket max is lower than the deductible. Double-check this plan.',
    )
  }

  if (
    isFiniteNumber(plan.familyDeductible) &&
    isFiniteNumber(plan.familyOutOfPocketMax) &&
    plan.familyDeductible > 0 &&
    plan.familyOutOfPocketMax > 0 &&
    plan.familyOutOfPocketMax < plan.familyDeductible
  ) {
    warnings.push(
      'Family out-of-pocket max is lower than the deductible. Double-check this plan.',
    )
  }

  if (
    isFiniteNumber(plan.individualDeductible) &&
    isFiniteNumber(plan.familyDeductible) &&
    plan.familyDeductible < plan.individualDeductible
  ) {
    warnings.push(
      'Family deductible is lower than the individual deductible. Double-check this plan.',
    )
  }

  if (
    isFiniteNumber(plan.individualOutOfPocketMax) &&
    isFiniteNumber(plan.familyOutOfPocketMax) &&
    plan.familyOutOfPocketMax < plan.individualOutOfPocketMax
  ) {
    warnings.push(
      'Family out-of-pocket max is lower than the individual out-of-pocket max. Double-check this plan.',
    )
  }

  return { errors, warnings, fieldErrors }
}

export function validateAnnualMedicalSpend(annualMedicalSpend: number): ValidationResult {
  const errors: string[] = []
  const fieldErrors: ValidationResult['fieldErrors'] = {}

  if (!isFiniteNumber(annualMedicalSpend)) {
    fieldErrors.annualMedicalSpend = 'Annual medical spend must be a valid number.'
    errors.push(fieldErrors.annualMedicalSpend)
  } else if (annualMedicalSpend < 0) {
    fieldErrors.annualMedicalSpend = 'Annual medical spend cannot be negative.'
    errors.push(fieldErrors.annualMedicalSpend)
  }

  return { errors, warnings: [], fieldErrors }
}
