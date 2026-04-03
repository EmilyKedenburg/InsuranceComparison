export const interpretScenarioToolName = 'interpret_insurance_scenario'
export const maxUserInputLength = 1000
export const maxPlansAllowed = 4
export const maxSerializedPayloadSize = 12000
export const openAiTimeoutMs = 8000

const allowedScenarioTypes = [
  'healthy',
  'moderate',
  'maternity',
  'chronic_condition',
  'major_event',
]

const allowedPlanFields = [
  'name',
  'monthlyPremium',
  'individualDeductible',
  'familyDeductible',
  'coinsurance',
  'individualOutOfPocketMax',
  'familyOutOfPocketMax',
  'employerContribution',
  'hsaContribution',
  'hraContribution',
]

const forbiddenModelFields = [
  'finalPlanTotals',
  'recommendedWinner',
  'planRanking',
  'directCostComparisons',
  'totalAnnualCost',
  'winner',
  'ranking',
  'costComparison',
]

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function coerceFiniteNumber(value) {
  return Number.isFinite(value) ? value : 0
}

export function logAiScenarioEvent(level, event, details = {}) {
  const logger =
    level === 'error'
      ? console.error
      : level === 'warn'
        ? console.warn
        : console.info

  logger(
    JSON.stringify({
      area: 'ai_scenario',
      event,
      ...details,
    }),
  )
}

export function validateAiScenarioPayload(payload) {
  if (!isPlainObject(payload)) {
    return 'Request body must be a JSON object.'
  }

  if (JSON.stringify(payload).length > maxSerializedPayloadSize) {
    return 'Request payload is too large.'
  }

  if (typeof payload.userInput !== 'string' || !payload.userInput.trim()) {
    return 'userInput is required.'
  }

  if (payload.userInput.length > maxUserInputLength) {
    return `userInput must be ${maxUserInputLength} characters or fewer.`
  }

  if (payload.coverageType !== 'individual' && payload.coverageType !== 'family') {
    return 'coverageType must be individual or family.'
  }

  if (!Array.isArray(payload.plans) || payload.plans.length === 0) {
    return 'plans must be a non-empty array.'
  }

  if (payload.plans.length > maxPlansAllowed) {
    return `plans must contain ${maxPlansAllowed} plans or fewer.`
  }

  for (const plan of payload.plans) {
    if (!isPlainObject(plan)) {
      return 'Each plan must be an object.'
    }

    const planKeys = Object.keys(plan)
    const hasOnlyAllowedFields = planKeys.every((key) => allowedPlanFields.includes(key))

    if (!hasOnlyAllowedFields) {
      return 'plans contain unsupported fields.'
    }

    const hasAllRequiredFields = allowedPlanFields.every((key) => key in plan)

    if (!hasAllRequiredFields) {
      return 'plans are missing required fields.'
    }
  }

  return null
}

export function sanitizePlanContext(plans, coverageType) {
  return plans.map((plan) => ({
    name: typeof plan.name === 'string' ? plan.name : '',
    monthlyPremium: coerceFiniteNumber(plan.monthlyPremium),
    individualDeductible: coerceFiniteNumber(plan.individualDeductible),
    familyDeductible: coerceFiniteNumber(plan.familyDeductible),
    coinsurance: coerceFiniteNumber(plan.coinsurance),
    individualOopMax: coerceFiniteNumber(plan.individualOutOfPocketMax),
    familyOopMax: coerceFiniteNumber(plan.familyOutOfPocketMax),
    employerContribution: coerceFiniteNumber(plan.employerContribution),
    hsaContribution: coerceFiniteNumber(plan.hsaContribution),
    hraContribution: coerceFiniteNumber(plan.hraContribution),
    coverageType,
  }))
}

export function sanitizeAiScenarioPayload(payload) {
  return {
    userInput: payload.userInput.trim(),
    coverageType: payload.coverageType,
    plans: sanitizePlanContext(payload.plans, payload.coverageType),
  }
}

export function buildAiScenarioPrompt(payload) {
  return [
    `Coverage type: ${payload.coverageType}`,
    `Current plans: ${JSON.stringify(payload.plans)}`,
    `User scenario: ${payload.userInput}`,
  ].join('\n\n')
}

export function buildAiScenarioRequest(payload, model = 'gpt-4o-mini') {
  const sanitizedPayload = sanitizeAiScenarioPayload(payload)

  return {
    model,
    max_output_tokens: 400,
    instructions: [
      'You are an insurance scenario interpreter.',
      'Translate a plain-English healthcare scenario into structured insurance spending inputs.',
      'You are not the calculator and must not return plan cost comparisons, recommended winners, rankings, or plan totals.',
      'Always respond by calling the provided function exactly once.',
      'Use only these scenario types: healthy, moderate, maternity, chronic_condition, major_event.',
      'Confidence must be a number from 0 to 1.',
      'Assumptions should be short, concrete, and user-friendly.',
    ].join(' '),
    input: buildAiScenarioPrompt(sanitizedPayload),
    tool_choice: {
      type: 'function',
      name: interpretScenarioToolName,
    },
    tools: [
      {
        type: 'function',
        name: interpretScenarioToolName,
        description:
          'Interpret a healthcare scenario into structured insurance spending assumptions.',
        strict: true,
        parameters: {
          type: 'object',
          additionalProperties: false,
          required: [
            'scenarioType',
            'estimatedAnnualMedicalSpend',
            'assumptions',
            'confidence',
          ],
          properties: {
            scenarioType: {
              type: 'string',
              enum: allowedScenarioTypes,
            },
            estimatedAnnualMedicalSpend: {
              type: 'number',
              minimum: 0,
            },
            assumptions: {
              type: 'array',
              items: {
                type: 'string',
              },
            },
            confidence: {
              type: 'number',
              minimum: 0,
              maximum: 1,
            },
          },
        },
      },
    ],
  }
}

export function normalizeAiScenarioInterpretation(interpretation) {
  return {
    scenarioType: interpretation.scenarioType,
    estimatedAnnualMedicalSpend: Math.max(
      0,
      Number.isFinite(interpretation.estimatedAnnualMedicalSpend)
        ? interpretation.estimatedAnnualMedicalSpend
        : 0,
    ),
    assumptions: Array.isArray(interpretation.assumptions)
      ? interpretation.assumptions.filter(Boolean)
      : [],
    confidence: Math.min(
      1,
      Math.max(0, Number.isFinite(interpretation.confidence) ? interpretation.confidence : 0),
    ),
  }
}

export function extractAiScenarioInterpretation(response, normalizeScenarioInterpretation) {
  const toolCall = response.output?.find(
    (item) =>
      item.type === 'function_call' && item.name === interpretScenarioToolName,
  )

  if (!toolCall?.arguments) {
    const error = new Error('The AI response did not include the required scenario tool call.')
    error.code = 'missing_tool_call'
    throw error
  }

  let parsedArguments

  try {
    parsedArguments = JSON.parse(toolCall.arguments)
  } catch {
    const error = new Error('The AI response normalization failed.')
    error.code = 'normalization_failed'
    throw error
  }

  const forbiddenField = forbiddenModelFields.find((field) => field in parsedArguments)
  if (forbiddenField) {
    const error = new Error(
      `The AI response included forbidden calculator output: ${forbiddenField}.`,
    )
    error.code = 'forbidden_output'
    throw error
  }

  const normalized = normalizeScenarioInterpretation(parsedArguments)
  if (!allowedScenarioTypes.includes(normalized.scenarioType)) {
    const error = new Error('The AI response normalization failed.')
    error.code = 'normalization_failed'
    throw error
  }

  return normalized
}

async function fetchWithTimeout(url, init, timeoutMs, fetchImpl) {
  const abortController = new AbortController()
  const timeout = setTimeout(() => abortController.abort(), timeoutMs)

  try {
    return await fetchImpl(url, {
      ...init,
      signal: abortController.signal,
    })
  } finally {
    clearTimeout(timeout)
  }
}

export async function requestAiScenarioInterpretationFromOpenAi({
  payload,
  apiKey,
  model = 'gpt-4o-mini',
  fetchImpl = fetch,
  timeoutMs = openAiTimeoutMs,
  logEvent = logAiScenarioEvent,
}) {
  const openAiRequest = buildAiScenarioRequest(payload, model)

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    logEvent('info', 'openai_request_started', {
      attempt,
      coverageType: payload.coverageType,
      planCount: payload.plans.length,
      userInputLength: payload.userInput.length,
    })

    try {
      const openAiResponse = await fetchWithTimeout(
        'https://api.openai.com/v1/responses',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(openAiRequest),
        },
        timeoutMs,
        fetchImpl,
      )

      if (!openAiResponse.ok) {
        const errorText = await openAiResponse.text()
        throw new Error(`OpenAI request failed: ${errorText}`)
      }

      const openAiPayload = await openAiResponse.json()
      return extractAiScenarioInterpretation(
        openAiPayload,
        normalizeAiScenarioInterpretation,
      )
    } catch (error) {
      const isTimeout =
        error instanceof Error &&
        (error.name === 'AbortError' || /aborted|timeout/i.test(error.message))

      if (isTimeout) {
        logEvent('warn', 'openai_timeout', { attempt, timeoutMs })

        if (attempt < 2) {
          continue
        }

        throw new Error(
          'The AI consultant took too long to respond. Please try again in a moment.',
        )
      }

      throw error
    }
  }

  throw new Error('Unable to interpret the scenario right now.')
}
