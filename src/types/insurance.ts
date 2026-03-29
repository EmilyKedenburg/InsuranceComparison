export type CoverageType = 'individual' | 'family'

export interface InsurancePlan {
  name: string
  monthlyPremium: number
  individualDeductible: number
  familyDeductible: number
  coinsurance: number
  individualOutOfPocketMax: number
  familyOutOfPocketMax: number
  employerContribution: number
  hsaContribution: number
  hraContribution: number
}

export interface AnnualCostBreakdown {
  medicalSpendInput: number
  premiumCost: number
  medicalCostPaid: number
  adjustedMedicalCost: number
  employerContribution: number
  hsaContribution: number
  hraContribution: number
  totalAnnualCost: number
}
