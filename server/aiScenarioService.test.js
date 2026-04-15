import { describe, expect, it } from 'vitest'
import { defaultPlans } from '../src/data/defaultPlans'
import {
  analyzeScenarioCostEstimate,
  buildAiScenarioRequest,
  extractRecurringAnnualSpend,
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
      '',
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
        'individual',
      ),
    ).toThrow('forbidden calculator output')
  })

  it('throws when the model does not return the required tool call', () => {
    expect(() =>
      extractAiScenarioInterpretation(
        { output: [{ type: 'message', name: 'not_a_tool' }] },
        normalizeAiScenarioInterpretation,
        'individual',
      ),
    ).toThrow('required scenario tool call')
  })

  it('extracts weekly recurring costs from plain-English inputs', () => {
    expect(
      extractRecurringAnnualSpend('I have weekly therapy appointments that cost $100'),
    ).toBe(5200)
  })

  it('extracts monthly recurring costs from plain-English inputs', () => {
    expect(
      extractRecurringAnnualSpend('I have monthly specialist visits that cost $150 each'),
    ).toBe(1800)
  })

  it('keeps explicit monthly $100 prompts at 1200 instead of the moderate floor', () => {
    const interpretation = extractAiScenarioInterpretation(
      {
        output: [
          {
            type: 'function_call',
            name: interpretScenarioToolName,
            arguments: JSON.stringify({
              scenarioType: 'moderate',
              estimatedAnnualMedicalSpend: 700,
              assumptions: ['Monthly therapy'],
              confidence: 0.79,
            }),
          },
        ],
      },
      normalizeAiScenarioInterpretation,
      'individual',
      'I have monthly therapy appointments that cost $100 each',
    )

    expect(interpretation).toEqual({
      scenarioType: 'moderate',
      estimatedAnnualMedicalSpend: 1200,
      assumptions: ['Recurring care: 12 visits/year x $100 = $1,200.'],
      confidence: 0.79,
    })
  })

  it('keeps explicit monthly recurring prompts near the raw extracted total', () => {
    const interpretation = extractAiScenarioInterpretation(
      {
        output: [
          {
            type: 'function_call',
            name: interpretScenarioToolName,
            arguments: JSON.stringify({
              scenarioType: 'chronic_condition',
              estimatedAnnualMedicalSpend: 9000,
              assumptions: ['Monthly specialist visits'],
              confidence: 0.81,
            }),
          },
        ],
      },
      normalizeAiScenarioInterpretation,
      'individual',
      'I have monthly specialist visits that cost $150 each',
    )

    expect(interpretation).toEqual({
      scenarioType: 'moderate',
      estimatedAnnualMedicalSpend: 1800,
      assumptions: ['Recurring care: 12 visits/year x $150 = $1,800.'],
      confidence: 0.81,
    })
  })

  it('extracts biweekly recurring costs from plain-English inputs', () => {
    expect(
      extractRecurringAnnualSpend('I have biweekly physical therapy visits at $80 per visit'),
    ).toBe(2080)
  })

  it('keeps explicit biweekly $100 prompts at 2600 instead of the moderate floor', () => {
    const interpretation = extractAiScenarioInterpretation(
      {
        output: [
          {
            type: 'function_call',
            name: interpretScenarioToolName,
            arguments: JSON.stringify({
              scenarioType: 'moderate',
              estimatedAnnualMedicalSpend: 900,
              assumptions: ['Biweekly therapy'],
              confidence: 0.74,
            }),
          },
        ],
      },
      normalizeAiScenarioInterpretation,
      'individual',
      'I have biweekly therapy appointments that cost $100 each',
    )

    expect(interpretation).toEqual({
      scenarioType: 'moderate',
      estimatedAnnualMedicalSpend: 2600,
      assumptions: ['Recurring care: 26 visits/year x $100 = $2,600.'],
      confidence: 0.74,
    })
  })

  it('extracts twice-a-month recurring costs from plain-English inputs', () => {
    expect(
      extractRecurringAnnualSpend('I have twice a month injections that cost $250 each'),
    ).toBe(6000)
  })

  it('supports comma-formatted recurring prices', () => {
    expect(
      extractRecurringAnnualSpend('I have monthly infusions that cost $1,250 each'),
    ).toBe(15000)
  })

  it('sums multiple recurring clauses in one scenario description', () => {
    expect(
      extractRecurringAnnualSpend(
        'I have weekly therapy appointments that cost $100 and monthly specialist visits that cost $150 each.',
      ),
    ).toBe(7000)
  })

  it('sums multiple explicit recurring prompts correctly', () => {
    expect(
      extractRecurringAnnualSpend('weekly therapy at $100 + monthly psychiatry at $200'),
    ).toBe(7600)
    expect(
      extractRecurringAnnualSpend('weekly PT at $80 + monthly specialist at $150'),
    ).toBe(5960)
  })

  it('sums recurring and one-time costs in the same prompt', () => {
    expect(
      extractRecurringAnnualSpend('weekly therapy at $100 + one procedure at $2000'),
    ).toBe(7200)
  })

  it('returns zero when a recurring frequency is present without a per-visit cost', () => {
    expect(
      extractRecurringAnnualSpend('I have weekly therapy appointments.'),
    ).toBe(0)
  })

  it('returns zero when a per-visit cost is present without a recurring frequency', () => {
    expect(
      extractRecurringAnnualSpend('My therapy appointments cost $100 each.'),
    ).toBe(0)
  })

  it('uses recurring usage extraction when it exceeds the model spend estimate', () => {
    const interpretation = extractAiScenarioInterpretation(
      {
        output: [
          {
            type: 'function_call',
            name: interpretScenarioToolName,
            arguments: JSON.stringify({
              scenarioType: 'moderate',
              estimatedAnnualMedicalSpend: 1000,
              assumptions: ['Weekly therapy'],
              confidence: 0.77,
            }),
          },
        ],
      },
      normalizeAiScenarioInterpretation,
      'individual',
      'I have weekly therapy appointments that cost $100',
    )

    expect(interpretation).toEqual({
      scenarioType: 'moderate',
      estimatedAnnualMedicalSpend: 5200,
      assumptions: ['Recurring care: 52 visits/year x $100 = $5,200.'],
      confidence: 0.77,
    })
  })

  it('lets mixed explicit and vague prompts be driven by extracted values', () => {
    const interpretation = extractAiScenarioInterpretation(
      {
        output: [
          {
            type: 'function_call',
            name: interpretScenarioToolName,
            arguments: JSON.stringify({
              scenarioType: 'moderate',
              estimatedAnnualMedicalSpend: 1400,
              assumptions: ['Weekly therapy and maybe extra care'],
              confidence: 0.72,
            }),
          },
        ],
      },
      normalizeAiScenarioInterpretation,
      'individual',
      'I have weekly therapy appointments that cost $100 and maybe a few extra visits this year',
    )

    expect(interpretation).toEqual({
      scenarioType: 'moderate',
      estimatedAnnualMedicalSpend: 5200,
      assumptions: ['Recurring care: 52 visits/year x $100 = $5,200.'],
      confidence: 0.72,
    })
  })

  it('keeps scenario floors for vague prompts that require inferred estimates', () => {
    const interpretation = extractAiScenarioInterpretation(
      {
        output: [
          {
            type: 'function_call',
            name: interpretScenarioToolName,
            arguments: JSON.stringify({
              scenarioType: 'chronic_condition',
              estimatedAnnualMedicalSpend: 1000,
              assumptions: ['Monthly therapy'],
              confidence: 0.8,
            }),
          },
        ],
      },
      normalizeAiScenarioInterpretation,
      'individual',
      'I have a chronic condition and regular care throughout the year',
    )

    expect(interpretation).toEqual({
      scenarioType: 'chronic_condition',
      estimatedAnnualMedicalSpend: 8000,
      assumptions: ['Monthly therapy'],
      confidence: 0.8,
    })
  })

  it('does not inflate explicit family prompts to family floors when only one person usage is described', () => {
    const interpretation = extractAiScenarioInterpretation(
      {
        output: [
          {
            type: 'function_call',
            name: interpretScenarioToolName,
            arguments: JSON.stringify({
              scenarioType: 'moderate',
              estimatedAnnualMedicalSpend: 9000,
              assumptions: ['Weekly therapy for one family member'],
              confidence: 0.76,
            }),
          },
        ],
      },
      normalizeAiScenarioInterpretation,
      'family',
      'My son has weekly therapy appointments that cost $100 each',
    )

    expect(interpretation).toEqual({
      scenarioType: 'moderate',
      estimatedAnnualMedicalSpend: 5200,
      assumptions: ['Recurring care: 52 visits/year x $100 = $5,200.'],
      confidence: 0.76,
    })
  })

  it('tracks extracted estimation mode for explicit cost prompts', () => {
    expect(
      analyzeScenarioCostEstimate('I have weekly therapy appointments that cost $100'),
    ).toMatchObject({
      estimationMode: 'extracted',
      extractedAnnualSpend: 5200,
      extractedItemCount: 1,
    })
  })

  it('keeps weekly PT at $75 strictly tied to the extracted total', () => {
    const interpretation = extractAiScenarioInterpretation(
      {
        output: [
          {
            type: 'function_call',
            name: interpretScenarioToolName,
            arguments: JSON.stringify({
              scenarioType: 'chronic_condition',
              estimatedAnnualMedicalSpend: 9000,
              assumptions: ['Ongoing maintenance care'],
              confidence: 0.84,
            }),
          },
        ],
      },
      normalizeAiScenarioInterpretation,
      'individual',
      'I see a physical therapist every week and each visit costs $75',
    )

    expect(interpretation).toEqual({
      scenarioType: 'moderate',
      estimatedAnnualMedicalSpend: 3900,
      assumptions: ['Recurring care: 52 visits/year x $75 = $3,900.'],
      confidence: 0.84,
    })
  })

  it('keeps weekly therapy at $100 strictly tied to the extracted total', () => {
    const interpretation = extractAiScenarioInterpretation(
      {
        output: [
          {
            type: 'function_call',
            name: interpretScenarioToolName,
            arguments: JSON.stringify({
              scenarioType: 'chronic_condition',
              estimatedAnnualMedicalSpend: 8000,
              assumptions: ['Additional maintenance care'],
              confidence: 0.8,
            }),
          },
        ],
      },
      normalizeAiScenarioInterpretation,
      'individual',
      'I have weekly therapy appointments that cost $100',
    )

    expect(interpretation).toEqual({
      scenarioType: 'moderate',
      estimatedAnnualMedicalSpend: 5200,
      assumptions: ['Recurring care: 52 visits/year x $100 = $5,200.'],
      confidence: 0.8,
    })
  })

  it('keeps monthly psychiatry at $200 strictly tied to the extracted total', () => {
    const interpretation = extractAiScenarioInterpretation(
      {
        output: [
          {
            type: 'function_call',
            name: interpretScenarioToolName,
            arguments: JSON.stringify({
              scenarioType: 'moderate',
              estimatedAnnualMedicalSpend: 6000,
              assumptions: ['Potential further costs'],
              confidence: 0.73,
            }),
          },
        ],
      },
      normalizeAiScenarioInterpretation,
      'individual',
      'I have monthly psychiatry visits that cost $200 each',
    )

    expect(interpretation).toEqual({
      scenarioType: 'moderate',
      estimatedAnnualMedicalSpend: 2400,
      assumptions: ['Recurring care: 12 visits/year x $200 = $2,400.'],
      confidence: 0.73,
    })
  })

  it('keeps monthly psychiatrist medication-management visits at $200 below the moderate floor', () => {
    const interpretation = extractAiScenarioInterpretation(
      {
        output: [
          {
            type: 'function_call',
            name: interpretScenarioToolName,
            arguments: JSON.stringify({
              scenarioType: 'moderate',
              estimatedAnnualMedicalSpend: 5000,
              assumptions: ['Medication management'],
              confidence: 0.76,
            }),
          },
        ],
      },
      normalizeAiScenarioInterpretation,
      'individual',
      'I see my psychiatrist monthly for medication management and each visit is $200',
    )

    expect(interpretation).toEqual({
      scenarioType: 'moderate',
      estimatedAnnualMedicalSpend: 2400,
      assumptions: ['Recurring care: 12 visits/year x $200 = $2,400.'],
      confidence: 0.76,
    })
  })

  it('does not add inferred uplift to explicit prompts with extracted costs', () => {
    const interpretation = extractAiScenarioInterpretation(
      {
        output: [
          {
            type: 'function_call',
            name: interpretScenarioToolName,
            arguments: JSON.stringify({
              scenarioType: 'chronic_condition',
              estimatedAnnualMedicalSpend: 10000,
              assumptions: ['Requires additional care'],
              confidence: 0.78,
            }),
          },
        ],
      },
      normalizeAiScenarioInterpretation,
      'individual',
      'I see a physical therapist every week and each visit costs $75',
    )

    expect(interpretation.scenarioType).toBe('moderate')
    expect(interpretation.estimatedAnnualMedicalSpend).toBe(3900)
    expect(interpretation.assumptions).toEqual([
      'Recurring care: 52 visits/year x $75 = $3,900.',
    ])
  })

  it('uses inferred mode for fuzzy wording while preserving confidence', () => {
    const analysis = analyzeScenarioCostEstimate(
      'I might need some specialist visits and maybe a procedure this year',
    )

    expect(analysis).toMatchObject({
      estimationMode: 'inferred',
      extractedAnnualSpend: 0,
      hasFuzzyWording: true,
    })

    const interpretation = extractAiScenarioInterpretation(
      {
        output: [
          {
            type: 'function_call',
            name: interpretScenarioToolName,
            arguments: JSON.stringify({
              scenarioType: 'moderate',
              estimatedAnnualMedicalSpend: 1200,
              assumptions: ['Specialist visits'],
              confidence: 0.8,
            }),
          },
        ],
      },
      normalizeAiScenarioInterpretation,
      'individual',
      'I might need some specialist visits and maybe a procedure this year',
    )

    expect(interpretation).toEqual({
      scenarioType: 'moderate',
      estimatedAnnualMedicalSpend: 3000,
      assumptions: ['Specialist visits'],
      confidence: 0.8,
    })
  })

  it('keeps vague moderate prompts on the inferred floor path', () => {
    const interpretation = extractAiScenarioInterpretation(
      {
        output: [
          {
            type: 'function_call',
            name: interpretScenarioToolName,
            arguments: JSON.stringify({
              scenarioType: 'moderate',
              estimatedAnnualMedicalSpend: 1200,
              assumptions: ['Therapy and follow-up visits'],
              confidence: 0.71,
            }),
          },
        ],
      },
      normalizeAiScenarioInterpretation,
      'individual',
      'I expect a moderate year with therapy and some follow-up care',
    )

    expect(interpretation).toEqual({
      scenarioType: 'moderate',
      estimatedAnnualMedicalSpend: 3000,
      assumptions: ['Therapy and follow-up visits'],
      confidence: 0.71,
    })
  })

  it('keeps vague chronic-condition prompts on the inferred chronic floor path', () => {
    const interpretation = extractAiScenarioInterpretation(
      {
        output: [
          {
            type: 'function_call',
            name: interpretScenarioToolName,
            arguments: JSON.stringify({
              scenarioType: 'chronic_condition',
              estimatedAnnualMedicalSpend: 2500,
              assumptions: ['Recurring condition management'],
              confidence: 0.74,
            }),
          },
        ],
      },
      normalizeAiScenarioInterpretation,
      'individual',
      'I have a chronic condition and expect ongoing care this year',
    )

    expect(interpretation).toEqual({
      scenarioType: 'chronic_condition',
      estimatedAnnualMedicalSpend: 8000,
      assumptions: ['Recurring condition management'],
      confidence: 0.74,
    })
  })

  it('reclassifies explicit recurring therapy to moderate when no chronic evidence present', () => {
    const interpretation = extractAiScenarioInterpretation(
      {
        output: [
          {
            type: 'function_call',
            name: interpretScenarioToolName,
            arguments: JSON.stringify({
              scenarioType: 'chronic_condition',
              estimatedAnnualMedicalSpend: 5200,
              assumptions: ['Weekly therapy needs'],
              confidence: 0.75,
            }),
          },
        ],
      },
      normalizeAiScenarioInterpretation,
      'individual',
      'I have therapy every other week and it costs $100 each time',
    )

    expect(interpretation).toEqual({
      scenarioType: 'moderate',
      estimatedAnnualMedicalSpend: 2600,
      assumptions: ['Recurring care: 26 visits/year x $100 = $2,600.'],
      confidence: 0.75,
    })
  })

  it('keeps explicit recurring therapy classified as chronic_condition with explicit chronic evidence', () => {
    const interpretation = extractAiScenarioInterpretation(
      {
        output: [
          {
            type: 'function_call',
            name: interpretScenarioToolName,
            arguments: JSON.stringify({
              scenarioType: 'chronic_condition',
              estimatedAnnualMedicalSpend: 5200,
              assumptions: ['Chronic condition therapy needs'],
              confidence: 0.82,
            }),
          },
        ],
      },
      normalizeAiScenarioInterpretation,
      'individual',
      'I have a chronic condition and therapy every other week costs $100 each time',
    )

    expect(interpretation).toEqual({
      scenarioType: 'chronic_condition',
      estimatedAnnualMedicalSpend: 2600,
      assumptions: ['Recurring care: 26 visits/year x $100 = $2,600.'],
      confidence: 0.82,
    })
  })

  it('keeps named disease prompts classified as chronic_condition', () => {
    const interpretation = extractAiScenarioInterpretation(
      {
        output: [
          {
            type: 'function_call',
            name: interpretScenarioToolName,
            arguments: JSON.stringify({
              scenarioType: 'chronic_condition',
              estimatedAnnualMedicalSpend: 5200,
              assumptions: ['Diabetes management therapy'],
              confidence: 0.88,
            }),
          },
        ],
      },
      normalizeAiScenarioInterpretation,
      'individual',
      'I have diabetes and see a therapist weekly at $100 per visit',
    )

    expect(interpretation).toEqual({
      scenarioType: 'chronic_condition',
      estimatedAnnualMedicalSpend: 5200,
      assumptions: ['Recurring care: 52 visits/year x $100 = $5,200.'],
      confidence: 0.88,
    })
  })

  it('reclassifies biweekly specialist visits without chronic evidence', () => {
    const interpretation = extractAiScenarioInterpretation(
      {
        output: [
          {
            type: 'function_call',
            name: interpretScenarioToolName,
            arguments: JSON.stringify({
              scenarioType: 'chronic_condition',
              estimatedAnnualMedicalSpend: 3900,
              assumptions: ['Specialist care'],
              confidence: 0.70,
            }),
          },
        ],
      },
      normalizeAiScenarioInterpretation,
      'individual',
      'I have biweekly specialist visits that cost $150 each',
    )

    expect(interpretation).toEqual({
      scenarioType: 'moderate',
      estimatedAnnualMedicalSpend: 3900,
      assumptions: ['Recurring care: 26 visits/year x $150 = $3,900.'],
      confidence: 0.70,
    })
  })

  it('keeps vague chronic prompts with explicit chronic language on chronic floor', () => {
    const interpretation = extractAiScenarioInterpretation(
      {
        output: [
          {
            type: 'function_call',
            name: interpretScenarioToolName,
            arguments: JSON.stringify({
              scenarioType: 'chronic_condition',
              estimatedAnnualMedicalSpend: 1000,
              assumptions: ['Monthly therapy'],
              confidence: 0.8,
            }),
          },
        ],
      },
      normalizeAiScenarioInterpretation,
      'individual',
      'I have a chronic condition and regular care throughout the year',
    )

    expect(interpretation).toEqual({
      scenarioType: 'chronic_condition',
      estimatedAnnualMedicalSpend: 8000,
      assumptions: ['Monthly therapy'],
      confidence: 0.8,
    })
  })

  it('reclassifies explicit physical therapy to moderate without chronic evidence', () => {
    const interpretation = extractAiScenarioInterpretation(
      {
        output: [
          {
            type: 'function_call',
            name: interpretScenarioToolName,
            arguments: JSON.stringify({
              scenarioType: 'chronic_condition',
              estimatedAnnualMedicalSpend: 4000,
              assumptions: ['Physical therapy treatment'],
              confidence: 0.76,
            }),
          },
        ],
      },
      normalizeAiScenarioInterpretation,
      'individual',
      'I have weekly physical therapy at $75 per session',
    )

    expect(interpretation).toEqual({
      scenarioType: 'moderate',
      estimatedAnnualMedicalSpend: 3900,
      assumptions: ['Recurring care: 52 visits/year x $75 = $3,900.'],
      confidence: 0.76,
    })
  })

  it('keeps counseling classified as moderate even when model suggests chronic', () => {
    const interpretation = extractAiScenarioInterpretation(
      {
        output: [
          {
            type: 'function_call',
            name: interpretScenarioToolName,
            arguments: JSON.stringify({
              scenarioType: 'chronic_condition',
              estimatedAnnualMedicalSpend: 2400,
              assumptions: ['Mental health counseling'],
              confidence: 0.68,
            }),
          },
        ],
      },
      normalizeAiScenarioInterpretation,
      'individual',
      'I have monthly counseling sessions at $200 each',
    )

    expect(interpretation).toEqual({
      scenarioType: 'moderate',
      estimatedAnnualMedicalSpend: 2400,
      assumptions: ['Recurring care: 12 visits/year x $200 = $2,400.'],
      confidence: 0.68,
    })
  })
})
