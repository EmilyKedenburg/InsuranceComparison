export type CoverageType = 'individual' | 'family'
export type AccountContributionType = 'hsa' | 'hra'

export interface InsurancePlan {
  name: string
  monthlyPremium: number
  individualDeductible: number
  familyDeductible: number
  coinsurance: number
  individualOutOfPocketMax: number
  familyOutOfPocketMax: number
  employerContribution: number
  accountContributionType: AccountContributionType
  hsaHraContribution: number
}

export interface AnnualCostBreakdown {
  medicalSpendInput: number
  premiumCost: number
  medicalCostPaid: number
  employerContribution: number
  hsaHraContribution: number
  totalContribution: number
  totalAnnualCost: number
}
