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

const scenarioSpendFloors = {
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

const recurringFrequencyMatchers = [
  {
    pattern:
      /\b(?:weekly|every week|once a week|1x a week|one time a week|per week)\b/i,
    annualOccurrences: 52,
  },
  {
    pattern:
      /\b(?:biweekly|bi-weekly|every other week|every two weeks|once every two weeks)\b/i,
    annualOccurrences: 26,
  },
  {
    pattern:
      /\b(?:twice a month|two times a month|2x a month|semi-monthly|semimonthly)\b/i,
    annualOccurrences: 24,
  },
  {
    pattern:
      /\b(?:monthly|every month|once a month|1x a month|per month)\b/i,
    annualOccurrences: 12,
  },
]

const fuzzyEstimatePattern =
  /\b(?:about|around|roughly|approximately|approx|maybe|might|probably|not sure|i think|some|a few|few)\b/i

const oneTimeCostPatterns = [
  /\b(?:one[- ]time|one time|single)\b[^$]{0,80}?(?:costs?|at|for)\s+\$([0-9][0-9,]*(?:\.[0-9]{1,2})?)\b/i,
  /\bone\b[^$]{0,40}\b(?:procedure|surgery|operation|scan|mri|test|treatment|visit|appointment)\b[^$]{0,80}?(?:costs?|at|for)\s+\$([0-9][0-9,]*(?:\.[0-9]{1,2})?)\b/i,
  /\ba\b[^$]{0,40}\b(?:procedure|surgery|operation|scan|mri|test|treatment)\b[^$]{0,80}?(?:costs?|at|for)\s+\$([0-9][0-9,]*(?:\.[0-9]{1,2})?)\b/i,
]

// Patterns for explicit chronic condition evidence
const explicitChronicEvidencePatterns = [
  /\bchronic\s+(?:condition|disease|illness|care|management)\b/i,
  /\blong[- ]?term\s+(?:condition|disease|illness|care|management)\b/i,
  /\bongoing\s+disease\b/i,
  /\b(?:diabetes|asthma|hypertension|high blood pressure|copd|lupus|rheumatoid arthritis|heart disease|cancer|crohn|ulcerative colitis|cystic fibrosis|sickle cell|multiple sclerosis|parkinson|epilepsy|thyroid|bipolar|schizophrenia|depression|anxiety disorder)\b/i,
]

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function coerceFiniteNumber(value) {
  return Number.isFinite(value) ? value : 0
}

function parseDollarAmount(rawAmount) {
  const normalizedAmount = Number(String(rawAmount).replace(/,/g, ''))
  return Number.isFinite(normalizedAmount) ? normalizedAmount : null
}

function formatWholeDollarAmount(amount) {
  return `$${Math.round(amount).toLocaleString()}`
}

function getRecurringAnnualOccurrences(text) {
  for (const matcher of recurringFrequencyMatchers) {
    if (matcher.pattern.test(text)) {
      return matcher
    }
  }

  return null
}

function getRecurringCostPerVisit(text) {
  const recurringCostPatterns = [
    /\bcosts?\s+\$([0-9][0-9,]*(?:\.[0-9]{1,2})?)\b/i,
    /\beach\s+(?:visit|appointment|session)\s+costs?\s+\$([0-9][0-9,]*(?:\.[0-9]{1,2})?)\b/i,
    /\beach\s+(?:visit|appointment|session)\s+is\s+\$([0-9][0-9,]*(?:\.[0-9]{1,2})?)\b/i,
    /\$\s?([0-9][0-9,]*(?:\.[0-9]{1,2})?)\s*(?:each|each visit|each appointment)\b/i,
    /\$\s?([0-9][0-9,]*(?:\.[0-9]{1,2})?)\s*(?:per visit|per appointment)\b/i,
    /\bat\s+\$([0-9][0-9,]*(?:\.[0-9]{1,2})?)\s*(?:each|per visit|per appointment)?\b/i,
  ]

  for (const pattern of recurringCostPatterns) {
    const match = text.match(pattern)
    if (!match) {
      continue
    }

    return parseDollarAmount(match[1])
  }

  return null
}

function getOneTimeCost(text) {
  for (const pattern of oneTimeCostPatterns) {
    const match = text.match(pattern)
    if (!match) {
      continue
    }

    return parseDollarAmount(match[1])
  }

  return null
}

function splitCostClauses(userInput) {
  return userInput
    .split(/[.!?;\n]+/)
    .flatMap((segment) => segment.split(/\s*\+\s*/))
    .flatMap((segment) => segment.split(/,(?=\s*[A-Za-z])/))
    .flatMap((segment) => segment.split(/\s+\band\b\s+/i))
    .map((segment) => segment.trim())
    .filter(Boolean)
}

function mergeRelatedCostClauses(clauses) {
  const mergedClauses = []

  for (const clause of clauses) {
    const previousClause = mergedClauses[mergedClauses.length - 1]

    if (!previousClause) {
      mergedClauses.push(clause)
      continue
    }

    const previousHasFrequency = getRecurringAnnualOccurrences(previousClause) !== null
    const previousHasCost =
      getRecurringCostPerVisit(previousClause) !== null || getOneTimeCost(previousClause) !== null
    const currentHasFrequency = getRecurringAnnualOccurrences(clause) !== null
    const currentHasCost =
      getRecurringCostPerVisit(clause) !== null || getOneTimeCost(clause) !== null

    if (previousHasFrequency && !previousHasCost && !currentHasFrequency && currentHasCost) {
      mergedClauses[mergedClauses.length - 1] = `${previousClause} ${clause}`.trim()
      continue
    }

    mergedClauses.push(clause)
  }

  return mergedClauses
}

export function analyzeScenarioCostEstimate(userInput = '') {
  const normalizedInput = typeof userInput === 'string' ? userInput.trim() : ''

  if (!normalizedInput) {
    return {
      estimationMode: 'inferred',
      extractedAnnualSpend: 0,
      extractedItemCount: 0,
      hasFuzzyWording: false,
      extractedAssumptions: [],
    }
  }

  const clauses = mergeRelatedCostClauses(splitCostClauses(normalizedInput))
  const extractedAssumptions = []
  const extractedAnnualSpend = clauses.reduce((total, clause) => {
    const frequencyMatch = getRecurringAnnualOccurrences(clause)
    const costPerVisit = getRecurringCostPerVisit(clause)
    const oneTimeCost = getOneTimeCost(clause)

    if (frequencyMatch !== null && costPerVisit !== null) {
      const annualizedCost = frequencyMatch.annualOccurrences * costPerVisit
      extractedAssumptions.push(
        `${frequencyMatch.pattern.source.includes('weekly') ? 'Recurring care' : 'Recurring care'}: ${frequencyMatch.annualOccurrences} visits/year x ${formatWholeDollarAmount(costPerVisit)} = ${formatWholeDollarAmount(annualizedCost)}.`,
      )
      return total + annualizedCost
    }

    if (oneTimeCost !== null) {
      extractedAssumptions.push(`One-time cost: ${formatWholeDollarAmount(oneTimeCost)}.`)
      return total + oneTimeCost
    }

    return total
  }, 0)

  const extractedItemCount = clauses.reduce((count, clause) => {
    const hasRecurringItem =
      getRecurringAnnualOccurrences(clause) !== null &&
      getRecurringCostPerVisit(clause) !== null
    const hasOneTimeItem = getOneTimeCost(clause) !== null

    return count + (hasRecurringItem || hasOneTimeItem ? 1 : 0)
  }, 0)

  return {
    estimationMode: extractedItemCount > 0 ? 'extracted' : 'inferred',
    extractedAnnualSpend,
    extractedItemCount,
    hasFuzzyWording: fuzzyEstimatePattern.test(normalizedInput),
    extractedAssumptions,
  }
}

export function extractRecurringAnnualSpend(userInput = '') {
  return analyzeScenarioCostEstimate(userInput).extractedAnnualSpend
}

function normalizeConfidence(confidence) {
  return Math.min(1, Math.max(0, Number.isFinite(confidence) ? confidence : 0))
}

function hasExplicitChronicEvidence(userInput) {
  const normalizedInput = typeof userInput === 'string' ? userInput.trim() : ''
  return explicitChronicEvidencePatterns.some((pattern) => pattern.test(normalizedInput))
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

export function normalizeAiScenarioInterpretation(
  interpretation,
  coverageType = 'individual',
  costEstimate = {
    estimationMode: 'inferred',
    extractedAnnualSpend: 0,
    hasFuzzyWording: false,
    extractedAssumptions: [],
  },
  userInput = '',
) {
  const normalizedModelSpend = Math.max(
    0,
    Number.isFinite(interpretation.estimatedAnnualMedicalSpend)
      ? interpretation.estimatedAnnualMedicalSpend
      : 0,
  )
  const normalizedExtractedSpend = Math.max(
    0,
    Number.isFinite(costEstimate.extractedAnnualSpend)
      ? costEstimate.extractedAnnualSpend
      : 0,
  )
  const spendFloor =
    scenarioSpendFloors[coverageType]?.[interpretation.scenarioType] ?? 0
  const estimatedAnnualMedicalSpend =
    costEstimate.estimationMode === 'extracted'
      ? normalizedExtractedSpend
      : Math.max(normalizedModelSpend, spendFloor)

  // For explicit recurring-cost prompts (extracted mode), reclassify chronic_condition to moderate
  // unless there is explicit chronic condition evidence in the user input
  let scenarioType = interpretation.scenarioType
  if (
    costEstimate.estimationMode === 'extracted' &&
    scenarioType === 'chronic_condition' &&
    !hasExplicitChronicEvidence(userInput)
  ) {
    scenarioType = 'moderate'
  }

  return {
    scenarioType,
    estimatedAnnualMedicalSpend,
    assumptions:
      costEstimate.estimationMode === 'extracted'
        ? costEstimate.extractedAssumptions
        : Array.isArray(interpretation.assumptions)
          ? interpretation.assumptions.filter(Boolean)
          : [],
    confidence: normalizeConfidence(interpretation.confidence),
  }
}

export function extractAiScenarioInterpretation(
  response,
  normalizeScenarioInterpretation,
  coverageType = 'individual',
  userInput = '',
) {
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

  const costEstimate = analyzeScenarioCostEstimate(userInput)
  const normalized = normalizeScenarioInterpretation(
    parsedArguments,
    coverageType,
    costEstimate,
    userInput,
  )
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
        payload.coverageType,
        payload.userInput,
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
