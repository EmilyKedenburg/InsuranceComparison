import { describe, expect, it, vi } from 'vitest'
import { createAiScenarioHandler } from './aiScenarioRoute'

function createMockResponse() {
  return {
    statusCode: 200,
    payload: null,
    status(code) {
      this.statusCode = code
      return this
    },
    json(payload) {
      this.payload = payload
      return this
    },
  }
}

describe('aiScenarioRoute', () => {
  it('rejects oversized or malformed requests with a 400 response', async () => {
    const handler = createAiScenarioHandler({
      fetchImpl: vi.fn(),
      getEnvValue: () => 'test-key',
      logEvent: vi.fn(),
    })

    const response = createMockResponse()
    await handler(
      {
        ip: '127.0.0.1',
        body: {
          userInput: 'Scenario',
          coverageType: 'individual',
          plans: [
            {
              name: 'PPO',
              monthlyPremium: 320,
              individualDeductible: 1500,
              familyDeductible: 3000,
              coinsurance: 20,
              individualOutOfPocketMax: 5000,
              familyOutOfPocketMax: 10000,
              employerContribution: 1000,
              hsaContribution: 0,
              hraContribution: 0,
              extraField: 'not allowed',
            },
          ],
        },
      },
      response,
    )

    expect(response.statusCode).toBe(400)
    expect(response.payload).toEqual({
      error: 'plans contain unsupported fields.',
    })
  })

  it('returns a normalized backend response shape only', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        output: [
          {
            type: 'function_call',
            name: 'interpret_insurance_scenario',
            arguments: JSON.stringify({
              scenarioType: 'moderate',
              estimatedAnnualMedicalSpend: 5000,
              assumptions: ['Routine visits'],
              confidence: 0.8,
            }),
          },
        ],
      }),
    })

    const handler = createAiScenarioHandler({
      fetchImpl: fetchMock,
      getEnvValue: (name) => (name === 'OPENAI_API_KEY' ? 'test-key' : 'gpt-4o-mini'),
      logEvent: vi.fn(),
    })

    const response = createMockResponse()
    await handler(
      {
        ip: '127.0.0.1',
        body: {
          userInput: 'A moderate year',
          coverageType: 'individual',
          plans: [
            {
              name: 'PPO',
              monthlyPremium: 320,
              individualDeductible: 1500,
              familyDeductible: 3000,
              coinsurance: 20,
              individualOutOfPocketMax: 5000,
              familyOutOfPocketMax: 10000,
              employerContribution: 1000,
              hsaContribution: 0,
              hraContribution: 0,
            },
          ],
        },
      },
      response,
    )

    expect(response.statusCode).toBe(200)
    expect(response.payload).toEqual({
      scenarioType: 'moderate',
      estimatedAnnualMedicalSpend: 3000,
      assumptions: ['Routine visits'],
      confidence: 0.8,
    })
    expect(response.payload.interpretation).toBeUndefined()
  })

  it('returns a clear timeout error when OpenAI times out', async () => {
    const timeoutError = new Error('The operation was aborted.')
    timeoutError.name = 'AbortError'
    const fetchMock = vi.fn().mockRejectedValue(timeoutError)

    const handler = createAiScenarioHandler({
      fetchImpl: fetchMock,
      getEnvValue: (name) => (name === 'OPENAI_API_KEY' ? 'test-key' : 'gpt-4o-mini'),
      logEvent: vi.fn(),
    })

    const response = createMockResponse()
    await handler(
      {
        ip: '127.0.0.1',
        body: {
          userInput: 'A major event year',
          coverageType: 'individual',
          plans: [
            {
              name: 'PPO',
              monthlyPremium: 320,
              individualDeductible: 1500,
              familyDeductible: 3000,
              coinsurance: 20,
              individualOutOfPocketMax: 5000,
              familyOutOfPocketMax: 10000,
              employerContribution: 1000,
              hsaContribution: 0,
              hraContribution: 0,
            },
          ],
        },
      },
      response,
    )

    expect(response.statusCode).toBe(502)
    expect(response.payload).toEqual({
      error: 'The AI consultant took too long to respond. Please try again in a moment.',
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('sends only sanitized plan context to OpenAI', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        output: [
          {
            type: 'function_call',
            name: 'interpret_insurance_scenario',
            arguments: JSON.stringify({
              scenarioType: 'healthy',
              estimatedAnnualMedicalSpend: 500,
              assumptions: ['Preventive visit'],
              confidence: 0.9,
            }),
          },
        ],
      }),
    })

    const handler = createAiScenarioHandler({
      fetchImpl: fetchMock,
      getEnvValue: (name) => (name === 'OPENAI_API_KEY' ? 'test-key' : 'gpt-4o-mini'),
      logEvent: vi.fn(),
    })

    const response = createMockResponse()
    await handler(
      {
        ip: '127.0.0.1',
        body: {
          userInput: 'Healthy year',
          coverageType: 'family',
          plans: [
            {
              name: 'PPO',
              monthlyPremium: 320,
              individualDeductible: 1500,
              familyDeductible: 3000,
              coinsurance: 20,
              individualOutOfPocketMax: 5000,
              familyOutOfPocketMax: 10000,
              employerContribution: 1000,
              hsaContribution: 0,
              hraContribution: 0,
            },
          ],
        },
      },
      response,
    )

    const openAiBody = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(JSON.stringify(openAiBody)).not.toContain('individualOutOfPocketMax')
    expect(JSON.stringify(openAiBody)).not.toContain('familyOutOfPocketMax')
    expect(JSON.stringify(openAiBody)).toContain('individualOopMax')
    expect(JSON.stringify(openAiBody)).toContain('familyOopMax')
    expect(openAiBody.input).toContain('Coverage type: family')
    expect(openAiBody.input).toContain('"coverageType":"family"')
  })
})
