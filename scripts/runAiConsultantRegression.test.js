import { describe, expect, it } from 'vitest'
import { summarizeRegressionRows } from './runAiConsultantRegression.js'

function createRow(overrides = {}) {
  return {
    id: 'fixture',
    prompt: 'fixture prompt',
    runIndex: 1,
    scenario: 'custom',
    estimate: 1200,
    confidence: 0.8,
    classificationSource: 'parsed_utilization',
    spendSource: 'custom_derived',
    derivedSpend: 1200,
    fallbackReason: null,
    normalizedCadence: ['12 visits/year'],
    normalizedCostPerVisit: [100],
    normalizedVisitCount: [12],
    normalizedDuration: [],
    explicitCostDetected: true,
    chronicConditionTriggered: false,
    notes: '',
    ...overrides,
  }
}

describe('runAiConsultantRegression', () => {
  it('treats confidence-only variance as stable', () => {
    const rows = [
      createRow({ runIndex: 1, confidence: 0.72 }),
      createRow({ runIndex: 2, confidence: 0.81 }),
      createRow({ runIndex: 3, confidence: 0.76 }),
    ]

    const summary = summarizeRegressionRows(rows)

    expect(summary.trueUnstablePromptCount).toBe(0)
    expect(summary.confidenceVarianceOnlyCount).toBe(1)
    expect(rows.every((row) => row.isStableAcrossRuns)).toBe(true)
    expect(rows.every((row) => row.hasConfidenceOnlyVariance)).toBe(true)
    expect(rows.every((row) => row.stabilityReason === 'confidenceVarianceOnly')).toBe(true)
  })

  it('marks material scenario or estimate changes as unstable', () => {
    const rows = [
      createRow({ runIndex: 1, scenario: 'moderate', estimate: 3000, spendSource: 'heuristic_fallback' }),
      createRow({ runIndex: 2, scenario: 'major_event', estimate: 20000, spendSource: 'heuristic_fallback' }),
    ]

    const summary = summarizeRegressionRows(rows)

    expect(summary.trueUnstablePromptCount).toBe(1)
    expect(summary.confidenceVarianceOnlyCount).toBe(0)
    expect(rows.every((row) => row.isStableAcrossRuns === false)).toBe(true)
    expect(rows.every((row) => row.hasMaterialOutputVariance)).toBe(true)
    expect(rows.every((row) => row.stabilityReason === 'unstableAcrossRuns')).toBe(true)
  })
})
