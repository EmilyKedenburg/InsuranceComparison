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
}

export interface AnnualCostBreakdown {
  medicalSpendInput: number
  premiumCost: number
  medicalCostPaid: number
  employerContribution: number
  totalAnnualCost: number
}
