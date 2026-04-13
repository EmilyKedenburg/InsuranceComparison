import { describe, expect, it } from 'vitest'
import { defaultPlans } from '../src/data/defaultPlans'
import {
  buildAiScenarioRequest,
  extractAiScenarioInterpretation,
  interpretScenarioToolName,
  normalizeAiScenarioInterpretation,
  sanitizeAiScenarioPayload,
  validateAiScenarioPayload,
} from './aiScenarioService'

describe('aiScenarioService', () => {
  it('validates required frontend payload fields', () => {
    expect(validateAiScenarioPayload(null)).toBe('Request body must be a JSON object.')
    expect(validateAiScenarioPayload({})).toBe('userInput is required.')
    expect(
      validateAiScenarioPayload({
        userInput: 'Scenario',
        coverageType: 'group',
        plans: defaultPlans.slice(0, 2),
      }),
    ).toBe('coverageType must be individual or family.')
    expect(
      validateAiScenarioPayload({
        userInput: 'Scenario',
        coverageType: 'individual',
        plans: new Array(5).fill(defaultPlans[0]),
      }),
    ).toBe('plans must contain 4 plans or fewer.')
    expect(
      validateAiScenarioPayload({
        userInput: 'x'.repeat(1001),
        coverageType: 'individual',
        plans: defaultPlans.slice(0, 2),
      }),
    ).toBe('userInput must be 1000 characters or fewer.')
  })

  it('requires the structured interpretation tool in the OpenAI request', () => {
    const request = buildAiScenarioRequest({
      userInput: 'Mostly healthy year with annual checkups.',
      coverageType: 'individual',
      plans: defaultPlans.slice(0, 2),
    })

    expect(request.tool_choice).toEqual({
      type: 'function',
      name: interpretScenarioToolName,
    })
    expect(request.max_output_tokens).toBe(400)
    expect(request.tools).toHaveLength(1)
  })

  it('sanitizes plan context before sending it to OpenAI', () => {
    const sanitized = sanitizeAiScenarioPayload({
      userInput: 'Healthy year',
      coverageType: 'family',
      plans: [
        {
          ...defaultPlans[0],
          uiOnlyLabel: 'ignore me',
        },
      ],
      selectedView: 'condensed',
    })

    expect(sanitized).toEqual({
      userInput: 'Healthy year',
      coverageType: 'family',
      plans: [
        {
          name: 'PPO Plan',
          monthlyPremium: 320,
          individualDeductible: 1500,
          familyDeductible: 3000,
          coinsurance: 20,
          individualOopMax: 5000,
          familyOopMax: 10000,
          employerContribution: 1000,
          hsaContribution: 0,
          hraContribution: 0,
          coverageType: 'family',
        },
      ],
    })
  })

  it('extracts and normalizes the structured interpretation from a required tool call', () => {
    const interpretation = extractAiScenarioInterpretation(
      {
        output: [
          {
            type: 'function_call',
            name: interpretScenarioToolName,
            arguments: JSON.stringify({
              scenarioType: 'maternity',
              estimatedAnnualMedicalSpend: -500,
              assumptions: ['Prenatal visits', '', 'Delivery'],
              confidence: 1.4,
            }),
          },
        ],
      },
      normalizeAiScenarioInterpretation,
      'individual',
    )

    expect(interpretation).toEqual({
      scenarioType: 'maternity',
      estimatedAnnualMedicalSpend: 12000,
      assumptions: ['Prenatal visits', 'Delivery'],
      confidence: 1,
    })
  })

  it('raises chronic condition spend to the individual floor when the model undershoots', () => {
    const interpretation = normalizeAiScenarioInterpretation(
      {
        scenarioType: 'chronic_condition',
        estimatedAnnualMedicalSpend: 2400,
        assumptions: ['Ongoing specialist care', 'Recurring prescriptions'],
        confidence: 0.82,
      },
      'individual',
    )

    expect(interpretation).toEqual({
      scenarioType: 'chronic_condition',
      estimatedAnnualMedicalSpend: 8000,
      assumptions: ['Ongoing specialist care', 'Recurring prescriptions'],
      confidence: 0.82,
    })
  })

  it('raises major event spend to the family floor when the model undershoots', () => {
    const interpretation = normalizeAiScenarioInterpretation(
      {
        scenarioType: 'major_event',
        estimatedAnnualMedicalSpend: 18000,
        assumptions: ['Emergency care', 'Hospital stay'],
        confidence: 0.74,
      },
      'family',
    )

    expect(interpretation).toEqual({
      scenarioType: 'major_event',
      estimatedAnnualMedicalSpend: 30000,
      assumptions: ['Emergency care', 'Hospital stay'],
      confidence: 0.74,
    })
  })

  it('keeps higher spend estimates when they already exceed the floor', () => {
    const interpretation = normalizeAiScenarioInterpretation(
      {
        scenarioType: 'major_event',
        estimatedAnnualMedicalSpend: 50000,
        assumptions: ['Complex hospitalization'],
        confidence: 0.91,
      },
      'family',
    )

    expect(interpretation.estimatedAnnualMedicalSpend).toBe(50000)
    expect(interpretation.assumptions).toEqual(['Complex hospitalization'])
    expect(interpretation.confidence).toBe(0.91)
  })

  it('rejects forbidden calculator-like model output fields', () => {
    expect(() =>
      extractAiScenarioInterpretation(
        {
          output: [
            {
              type: 'function_call',
              name: interpretScenarioToolName,
              arguments: JSON.stringify({
                scenarioType: 'healthy',
                estimatedAnnualMedicalSpend: 500,
                assumptions: ['Annual checkup'],
                confidence: 0.9,
                recommendedWinner: 'PPO Plan',
              }),
            },
          ],
        },
        normalizeAiScenarioInterpretation,
      ),
    ).toThrow('forbidden calculator output')
  })

  it('throws when the model does not return the required tool call', () => {
    expect(() =>
      extractAiScenarioInterpretation(
        { output: [{ type: 'message', name: 'not_a_tool' }] },
        normalizeAiScenarioInterpretation,
      ),
    ).toThrow('required scenario tool call')
  })
})
