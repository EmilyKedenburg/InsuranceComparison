import type { InsurancePlan } from '../types/insurance'

export const defaultPlans: InsurancePlan[] = [
  {
    name: 'PPO Plan',
    monthlyPremium: 320,
    deductible: 1500,
    coinsurance: 20,
    outOfPocketMax: 5000,
    employerContribution: 1000,
  },
  {
    name: 'HDHP Plan',
    monthlyPremium: 185,
    deductible: 3200,
    coinsurance: 10,
    outOfPocketMax: 6500,
    employerContribution: 1800,
  },
]
