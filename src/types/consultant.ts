import type { CoverageType, InsurancePlan } from './insurance'

export type ScenarioType =
  | 'custom'
  | 'healthy'
  | 'moderate'
  | 'maternity'
  | 'chronic_condition'
  | 'major_event'

export interface ScenarioInterpretation {
  scenarioType: ScenarioType
  estimatedAnnualMedicalSpend: number
  assumptions: string[]
  confidence: number
  estimationMode?: 'extracted' | 'inferred'
}

export interface ScenarioInterpretationRequest {
  userInput: string
  coverageType: CoverageType
  plans: InsurancePlan[]
}
