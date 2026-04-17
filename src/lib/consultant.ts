import type { ScenarioInterpretation } from '../types/consultant'
import type { CoverageType } from '../types/insurance'

export const consultantDisclaimer =
  'This simulator provides estimates only, not medical advice. Final premiums, out-of-pocket costs, and claim payments are determined by the insurance carrier based on your policy and actual claims.'

const scenarioSpendFloors: Record<CoverageType, Record<ScenarioInterpretation['scenarioType'], number>> =
  {
    individual: {
      custom: 0,
      healthy: 500,
      moderate: 3000,
      chronic_condition: 8000,
      maternity: 12000,
      major_event: 20000,
    },
    family: {
      custom: 0,
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

  // Explicitly extracted spends should stay literal. Floors are only for
  // inferred estimates where the prompt does not provide concrete arithmetic.
  const estimatedAnnualMedicalSpend =
    interpretation.estimationMode === 'extracted'
      ? normalizedSpend
      : Math.max(normalizedSpend, scenarioSpendFloors[coverageType][interpretation.scenarioType])

  return {
    scenarioType: interpretation.scenarioType,
    estimatedAnnualMedicalSpend,
    assumptions: interpretation.assumptions.filter(Boolean),
    confidence: Math.min(
      1,
      Math.max(0, Number.isFinite(interpretation.confidence) ? interpretation.confidence : 0),
    ),
    estimationMode: interpretation.estimationMode ?? 'inferred',
  }
}
