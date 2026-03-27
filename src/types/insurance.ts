export interface InsurancePlan {
  name: string
  monthlyPremium: number
  deductible: number
  coinsurance: number
  outOfPocketMax: number
  employerContribution: number
}

export interface AnnualCostBreakdown {
  medicalSpendInput: number
  premiumCost: number
  medicalCostPaid: number
  employerContribution: number
  totalAnnualCost: number
}
