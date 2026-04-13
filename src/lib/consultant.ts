import type { ScenarioInterpretation } from '../types/consultant'
import type { CoverageType } from '../types/insurance'

export const consultantDisclaimer =
  'This is a financial simulation, not medical advice. Final costs depend on your insurer, the care you receive, and how claims are processed.'

const scenarioSpendFloors: Record<CoverageType, Record<ScenarioInterpretation['scenarioType'], number>> =
  {
    individual: {
      healthy: 500,
      moderate: 3000,
      chronic_condition: 8000,
      maternity: 12000,
      major_event: 20000,
    },
    family: {
      healthy: 1500,
      moderate: 8000,
      chronic_condition: 12000,
      maternity: 18000,
      major_event: 30000,
    },
  }

export function normalizeScenarioInterpretation(
  interpretation: ScenarioInterpretation,
  coverageType: CoverageType = 'individual',
): ScenarioInterpretation {
  const normalizedSpend = Math.max(
    0,
    Number.isFinite(interpretation.estimatedAnnualMedicalSpend)
      ? interpretation.estimatedAnnualMedicalSpend
      : 0,
  )

  return {
    scenarioType: interpretation.scenarioType,
    estimatedAnnualMedicalSpend: Math.max(
      normalizedSpend,
      scenarioSpendFloors[coverageType][interpretation.scenarioType],
    ),
    assumptions: interpretation.assumptions.filter(Boolean),
    confidence: Math.min(
      1,
      Math.max(0, Number.isFinite(interpretation.confidence) ? interpretation.confidence : 0),
    ),
  }
}
