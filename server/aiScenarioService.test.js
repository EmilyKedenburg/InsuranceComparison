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
      estimatedAnnualMedicalSpend: 0,
      assumptions: ['Prenatal visits', 'Delivery'],
      confidence: 1,
    })
  })

  it('keeps the model spend as-is for inferred ai scenarios instead of applying a floor', () => {
    const interpretation = normalizeAiScenarioInterpretation(
      {
        scenarioType: 'chronic_condition',
        estimatedAnnualMedicalSpend: 2400,
        assumptions: ['Ongoing specialist care', 'Recurring prescriptions'],
        confidence: 0.82,
      },
      'individual',
      {
        estimationMode: 'inferred',
        extractedAnnualSpend: 0,
        hasFuzzyWording: false,
        extractedAssumptions: [],
      },
      'I have a chronic condition and need ongoing specialist care.',
    )

    expect(interpretation).toEqual({
      scenarioType: 'chronic_condition',
      estimatedAnnualMedicalSpend: 2400,
      assumptions: ['Ongoing specialist care', 'Recurring prescriptions'],
      confidence: 0.82,
    })
  })

  it('keeps higher model estimates untouched for inferred ai scenarios', () => {
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
      estimatedAnnualMedicalSpend: 18000,
      assumptions: ['Emergency care', 'Hospital stay'],
      confidence: 0.74,
    })
  })

  it('keeps higher spend estimates when they already exceed prior floor values', () => {
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

  it('treats once a month and monthly as the same cadence', () => {
    expect(
      extractRecurringAnnualSpend('I go to therapy once a month and each visit is $100'),
    ).toBe(1200)
    expect(
      extractRecurringAnnualSpend('I go to therapy monthly and each visit is $100'),
    ).toBe(1200)
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
      scenarioType: 'custom',
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
      scenarioType: 'custom',
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

  it('extracts weekly therapy at $100 to 5200', () => {
    expect(
      extractRecurringAnnualSpend('I have therapy every week and it costs $100 each time'),
    ).toBe(5200)
  })

  it('extracts biweekly therapy at $100 to 2600', () => {
    expect(
      extractRecurringAnnualSpend('I have therapy every other week and it costs $100 each time'),
    ).toBe(2600)
  })

  it('extracts monthly therapy at $100 to 1200', () => {
    expect(
      extractRecurringAnnualSpend('I have therapy every month and it costs $100 each time'),
    ).toBe(1200)
  })

  it('extracts every-other-month counselor visits at $120 to 720', () => {
    expect(
      extractRecurringAnnualSpend('I see a counselor every other month for $120'),
    ).toBe(720)
  })

  it('treats every 2 months the same as every other month', () => {
    expect(
      extractRecurringAnnualSpend('I see a counselor every 2 months for $120'),
    ).toBe(720)
  })

  it('treats biweekly and every other week as the same cadence', () => {
    expect(
      extractRecurringAnnualSpend('I have therapy biweekly and it costs $100 each time'),
    ).toBe(2600)
    expect(
      extractRecurringAnnualSpend('I have therapy every other week and it costs $100 each time'),
    ).toBe(2600)
  })

  it('treats quarterly and every 3 months as the same cadence', () => {
    expect(
      extractRecurringAnnualSpend('I have one specialist follow-up every 3 months at $200'),
    ).toBe(800)
    expect(
      extractRecurringAnnualSpend('I have one specialist follow-up quarterly at $200'),
    ).toBe(800)
  })

  it('treats once a week, weekly, and every week consistently', () => {
    expect(
      extractRecurringAnnualSpend('I go to therapy once a week and each visit is $100'),
    ).toBe(5200)
    expect(
      extractRecurringAnnualSpend('I go to therapy weekly and each visit is $100'),
    ).toBe(5200)
    expect(
      extractRecurringAnnualSpend('I go to therapy every week and each visit is $100'),
    ).toBe(5200)
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
      scenarioType: 'custom',
      estimatedAnnualMedicalSpend: 2600,
      assumptions: ['Recurring care: 26 visits/year x $100 = $2,600.'],
      confidence: 0.74,
    })
  })

  it('does not let the moderate label raise explicit biweekly therapy spend', () => {
    const interpretation = extractAiScenarioInterpretation(
      {
        output: [
          {
            type: 'function_call',
            name: interpretScenarioToolName,
            arguments: JSON.stringify({
              scenarioType: 'moderate',
              estimatedAnnualMedicalSpend: 3000,
              assumptions: ['Biweekly therapy'],
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
      scenarioType: 'custom',
      estimatedAnnualMedicalSpend: 2600,
      assumptions: ['Recurring care: 26 visits/year x $100 = $2,600.'],
      confidence: 0.75,
    })
  })

  it('keeps every-other-month counselor prompts at 720 instead of the moderate floor', () => {
    const interpretation = extractAiScenarioInterpretation(
      {
        output: [
          {
            type: 'function_call',
            name: interpretScenarioToolName,
            arguments: JSON.stringify({
              scenarioType: 'moderate',
              estimatedAnnualMedicalSpend: 3000,
              assumptions: ['Counselor visits'],
              confidence: 0.73,
            }),
          },
        ],
      },
      normalizeAiScenarioInterpretation,
      'individual',
      'I see a counselor every other month for $120.',
    )

    expect(interpretation).toEqual({
      scenarioType: 'custom',
      estimatedAnnualMedicalSpend: 720,
      assumptions: ['Recurring care: 6 visits/year x $120 = $720.'],
      confidence: 0.73,
    })
  })

  it('keeps quarterly specialist follow-up prompts at 800 instead of the moderate floor', () => {
    const interpretation = extractAiScenarioInterpretation(
      {
        output: [
          {
            type: 'function_call',
            name: interpretScenarioToolName,
            arguments: JSON.stringify({
              scenarioType: 'moderate',
              estimatedAnnualMedicalSpend: 3000,
              assumptions: ['Specialist follow-up'],
              confidence: 0.72,
            }),
          },
        ],
      },
      normalizeAiScenarioInterpretation,
      'individual',
      'I have one specialist follow-up every 3 months at $200.',
    )

    expect(interpretation).toEqual({
      scenarioType: 'custom',
      estimatedAnnualMedicalSpend: 800,
      assumptions: ['Recurring care: 4 visits/year x $200 = $800.'],
      confidence: 0.72,
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

  it('extracts bounded temporary rehab utilization instead of annualizing it', () => {
    expect(
      extractRecurringAnnualSpend(
        'I need post-surgery PT twice a week for 8 weeks at $75 per session',
      ),
    ).toBe(1200)
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
      scenarioType: 'custom',
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
      scenarioType: 'custom',
      estimatedAnnualMedicalSpend: 5200,
      assumptions: ['Recurring care: 52 visits/year x $100 = $5,200.'],
      confidence: 0.72,
    })
  })

  it('keeps vague prompts on the model-estimate path without scenario floors', () => {
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
      estimatedAnnualMedicalSpend: 1000,
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
      scenarioType: 'custom',
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
      scenarioType: 'custom',
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
      scenarioType: 'custom',
      estimatedAnnualMedicalSpend: 5200,
      assumptions: ['Recurring care: 52 visits/year x $100 = $5,200.'],
      confidence: 0.8,
    })
  })

  it('treats weekly therapy as custom by default instead of chronic_condition', () => {
    const interpretation = extractAiScenarioInterpretation(
      {
        output: [
          {
            type: 'function_call',
            name: interpretScenarioToolName,
            arguments: JSON.stringify({
              scenarioType: 'chronic_condition',
              estimatedAnnualMedicalSpend: 9000,
              assumptions: ['Weekly therapy'],
              confidence: 0.76,
            }),
          },
        ],
      },
      normalizeAiScenarioInterpretation,
      'individual',
      'I have weekly therapy appointments that cost $100 each',
    )

    expect(interpretation).toEqual({
      scenarioType: 'custom',
      estimatedAnnualMedicalSpend: 5200,
      assumptions: ['Recurring care: 52 visits/year x $100 = $5,200.'],
      confidence: 0.76,
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
      scenarioType: 'custom',
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
      scenarioType: 'custom',
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

    expect(interpretation.scenarioType).toBe('custom')
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
      estimatedAnnualMedicalSpend: 1200,
      assumptions: ['Specialist visits'],
      confidence: 0.8,
    })
  })

  it('keeps vague moderate prompts on the inferred model-estimate path', () => {
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
      estimatedAnnualMedicalSpend: 1200,
      assumptions: ['Therapy and follow-up visits'],
      confidence: 0.71,
    })
  })

  it('keeps vague chronic-condition prompts on the inferred model-estimate path', () => {
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
      estimatedAnnualMedicalSpend: 2500,
      assumptions: ['Recurring condition management'],
      confidence: 0.74,
    })
  })

  it('reclassifies explicit recurring therapy to custom when no chronic evidence present', () => {
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
      scenarioType: 'custom',
      estimatedAnnualMedicalSpend: 2600,
      assumptions: ['Recurring care: 26 visits/year x $100 = $2,600.'],
      confidence: 0.75,
    })
  })

  it('uses custom for explicit recurring therapy even with chronic evidence because spend is derived directly', () => {
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
      scenarioType: 'custom',
      estimatedAnnualMedicalSpend: 2600,
      assumptions: ['Recurring care: 26 visits/year x $100 = $2,600.'],
      confidence: 0.82,
    })
  })

  it('keeps named disease prompts classified as chronic_condition when spend is heuristic', () => {
    const interpretation = extractAiScenarioInterpretation(
      {
        output: [
          {
            type: 'function_call',
            name: interpretScenarioToolName,
            arguments: JSON.stringify({
              scenarioType: 'chronic_condition',
              estimatedAnnualMedicalSpend: 6400,
              assumptions: ['Diabetes management care'],
              confidence: 0.88,
            }),
          },
        ],
      },
      normalizeAiScenarioInterpretation,
      'individual',
      'I have diabetes and need regular endocrinology visits and labs.',
    )

    expect(interpretation).toEqual({
      scenarioType: 'chronic_condition',
      estimatedAnnualMedicalSpend: 6400,
      assumptions: ['Diabetes management care'],
      confidence: 0.88,
    })
  })

  it('keeps crohns disease prompts classified as chronic_condition when spend is heuristic', () => {
    const interpretation = extractAiScenarioInterpretation(
      {
        output: [
          {
            type: 'function_call',
            name: interpretScenarioToolName,
            arguments: JSON.stringify({
              scenarioType: 'chronic_condition',
              estimatedAnnualMedicalSpend: 7800,
              assumptions: ['Ongoing GI specialist care'],
              confidence: 0.84,
            }),
          },
        ],
      },
      normalizeAiScenarioInterpretation,
      'individual',
      'I have Crohn’s disease and ongoing specialist care.',
    )

    expect(interpretation).toEqual({
      scenarioType: 'chronic_condition',
      estimatedAnnualMedicalSpend: 7800,
      assumptions: ['Ongoing GI specialist care'],
      confidence: 0.84,
    })
  })

  it('treats temporary post-surgery pt as custom rather than chronic_condition', () => {
    const interpretation = extractAiScenarioInterpretation(
      {
        output: [
          {
            type: 'function_call',
            name: interpretScenarioToolName,
            arguments: JSON.stringify({
              scenarioType: 'chronic_condition',
              estimatedAnnualMedicalSpend: 9000,
              assumptions: ['Post-surgery rehab'],
              confidence: 0.79,
            }),
          },
        ],
      },
      normalizeAiScenarioInterpretation,
      'individual',
      'I need post-surgery PT twice a week for 8 weeks at $75 per session',
    )

    expect(interpretation).toEqual({
      scenarioType: 'custom',
      estimatedAnnualMedicalSpend: 1200,
      assumptions: ['Recurring care: 16 visits x $75 = $1,200.'],
      confidence: 0.79,
    })
  })

  it('reclassifies biweekly specialist visits without chronic evidence to custom', () => {
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
      scenarioType: 'custom',
      estimatedAnnualMedicalSpend: 3900,
      assumptions: ['Recurring care: 26 visits/year x $150 = $3,900.'],
      confidence: 0.70,
    })
  })

  it('keeps vague chronic prompts with explicit chronic language on the model-estimate path', () => {
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
      estimatedAnnualMedicalSpend: 1000,
      assumptions: ['Monthly therapy'],
      confidence: 0.8,
    })
  })

  it('does not classify pregnancy planning as chronic_condition', () => {
    const interpretation = extractAiScenarioInterpretation(
      {
        output: [
          {
            type: 'function_call',
            name: interpretScenarioToolName,
            arguments: JSON.stringify({
              scenarioType: 'chronic_condition',
              estimatedAnnualMedicalSpend: 5000,
              assumptions: ['Prenatal planning'],
              confidence: 0.7,
            }),
          },
        ],
      },
      normalizeAiScenarioInterpretation,
      'individual',
      'I’m planning to have a baby this year.',
    )

    expect(interpretation).toEqual({
      scenarioType: 'moderate',
      estimatedAnnualMedicalSpend: 5000,
      assumptions: ['Prenatal planning'],
      confidence: 0.7,
    })
  })

  it('does not classify a recurring knee injury as chronic_condition by default', () => {
    const interpretation = extractAiScenarioInterpretation(
      {
        output: [
          {
            type: 'function_call',
            name: interpretScenarioToolName,
            arguments: JSON.stringify({
              scenarioType: 'chronic_condition',
              estimatedAnnualMedicalSpend: 7000,
              assumptions: ['PT for knee injury'],
              confidence: 0.72,
            }),
          },
        ],
      },
      normalizeAiScenarioInterpretation,
      'individual',
      'I have a recurring knee injury and go to PT weekly.',
    )

    expect(interpretation).toEqual({
      scenarioType: 'moderate',
      estimatedAnnualMedicalSpend: 7000,
      assumptions: ['PT for knee injury'],
      confidence: 0.72,
    })
  })

  it('reclassifies explicit physical therapy to custom without chronic evidence', () => {
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
      scenarioType: 'custom',
      estimatedAnnualMedicalSpend: 3900,
      assumptions: ['Recurring care: 52 visits/year x $75 = $3,900.'],
      confidence: 0.76,
    })
  })

  it('keeps counseling classified as custom when spend is explicitly derived', () => {
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
      scenarioType: 'custom',
      estimatedAnnualMedicalSpend: 2400,
      assumptions: ['Recurring care: 12 visits/year x $200 = $2,400.'],
      confidence: 0.68,
    })
  })
})
