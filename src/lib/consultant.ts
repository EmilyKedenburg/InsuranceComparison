import type { ScenarioInterpretation } from '../types/consultant'

export const consultantDisclaimer =
  'This is a financial simulation, not medical advice. Final costs depend on your insurer, the care you receive, and how claims are processed.'

export function normalizeScenarioInterpretation(
  interpretation: ScenarioInterpretation,
): ScenarioInterpretation {
  return {
    scenarioType: interpretation.scenarioType,
    estimatedAnnualMedicalSpend: Math.max(
      0,
      Number.isFinite(interpretation.estimatedAnnualMedicalSpend)
        ? interpretation.estimatedAnnualMedicalSpend
        : 0,
    ),
    assumptions: interpretation.assumptions.filter(Boolean),
    confidence: Math.min(
      1,
      Math.max(0, Number.isFinite(interpretation.confidence) ? interpretation.confidence : 0),
    ),
  }
}
