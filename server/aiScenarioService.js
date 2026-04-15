export const interpretScenarioToolName = 'interpret_insurance_scenario'
export const maxUserInputLength = 1000
export const maxPlansAllowed = 4
export const maxSerializedPayloadSize = 12000
export const openAiTimeoutMs = 8000

const allowedScenarioTypes = [
  'custom',
  'healthy',
  'moderate',
  'maternity',
  'chronic_condition',
  'major_event',
]

const scenarioHeuristicEstimates = {
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
    assumptionLabel: '52 visits/year',
  },
  {
    pattern:
      /\b(?:biweekly|bi-weekly|every other week|every two weeks|once every two weeks)\b/i,
    annualOccurrences: 26,
    assumptionLabel: '26 visits/year',
  },
  {
    pattern:
      /\b(?:twice a month|two times a month|2x a month|semi-monthly|semimonthly)\b/i,
    annualOccurrences: 24,
    assumptionLabel: '24 visits/year',
  },
  {
    pattern:
      /\b(?:monthly|every month|once a month|1x a month|per month)\b/i,
    annualOccurrences: 12,
    assumptionLabel: '12 visits/year',
  },
  {
    pattern:
      /\b(?:every other month|every two months|once every two months|every 2 months|bimonthly|bi-monthly)\b/i,
    annualOccurrences: 6,
    assumptionLabel: '6 visits/year',
  },
  {
    pattern:
      /\b(?:quarterly|once a quarter|every quarter|per quarter|every 3 months|every three months|once every 3 months|once every three months)\b/i,
    annualOccurrences: 4,
    assumptionLabel: '4 visits/year',
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
  /\b(?:diabetes|asthma|hypertension|high blood pressure|copd|lupus|rheumatoid arthritis|heart disease|cancer|crohn(?:['’]s)?(?: disease)?|ulcerative colitis|cystic fibrosis|sickle cell|multiple sclerosis|parkinson(?:['’]s)?|epilepsy|thyroid|bipolar|schizophrenia|depression|anxiety disorder|chronic kidney disease)\b/i,
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

function shouldLogAiScenarioDebug() {
  return String(process.env.AI_SCENARIO_DEBUG ?? '').toLowerCase() === 'true'
}

function getBoundedRecurringOccurrences(text) {
  const normalizedText = typeof text === 'string' ? text.trim() : ''
  const durationMatch = normalizedText.match(/\bfor\s+(\d+)\s+(weeks?|months?)\b/i)

  if (!durationMatch) {
    return null
  }

  const duration = Number(durationMatch[1])
  const durationUnit = durationMatch[2].toLowerCase()

  if (!Number.isFinite(duration) || duration <= 0) {
    return null
  }

  const cadenceMatchers = [
    {
      pattern:
        /\b(?:twice a week|two times a week|2x a week|two visits a week|two appointments a week)\b/i,
      unit: 'week',
      occurrencesPerUnit: 2,
    },
    {
      pattern:
        /\b(?:once a week|weekly|every week|1x a week|one time a week)\b/i,
      unit: 'week',
      occurrencesPerUnit: 1,
    },
    {
      pattern:
        /\b(?:twice a month|two times a month|2x a month)\b/i,
      unit: 'month',
      occurrencesPerUnit: 2,
    },
    {
      pattern:
        /\b(?:once a month|monthly|every month|1x a month)\b/i,
      unit: 'month',
      occurrencesPerUnit: 1,
    },
  ]

  for (const matcher of cadenceMatchers) {
    if (!matcher.pattern.test(normalizedText) || matcher.unit !== durationUnit.replace(/s$/, '')) {
      continue
    }

    const totalOccurrences = matcher.occurrencesPerUnit * duration
    return {
      annualOccurrences: totalOccurrences,
      assumptionLabel: `${totalOccurrences} visits`,
    }
  }

  return null
}

function getRecurringAnnualOccurrences(text) {
  const boundedOccurrences = getBoundedRecurringOccurrences(text)
  if (boundedOccurrences) {
    return boundedOccurrences
  }

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
    /\beach\s+time\s+costs?\s+\$([0-9][0-9,]*(?:\.[0-9]{1,2})?)\b/i,
    /\bit\s+costs?\s+\$([0-9][0-9,]*(?:\.[0-9]{1,2})?)\b/i,
    /\$\s?([0-9][0-9,]*(?:\.[0-9]{1,2})?)\s*(?:each|each visit|each appointment)\b/i,
    /\$\s?([0-9][0-9,]*(?:\.[0-9]{1,2})?)\s*(?:each time|per session|per visit|per appointment)\b/i,
    /\bfor\s+\$([0-9][0-9,]*(?:\.[0-9]{1,2})?)\b/i,
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
      extractedAnnualSpend: null,
      extractedItemCount: 0,
      hasFuzzyWording: false,
      extractedAssumptions: [],
      fallbackReason: 'empty_input',
      parseTrace: {
        normalizedPrompt: normalizedInput,
        detectedCadence: [],
        detectedDuration: [],
        detectedExplicitCosts: [],
        detectedVisitCounts: [],
        derivedSpend: null,
        fallbackUsed: true,
      },
    }
  }

  const clauses = mergeRelatedCostClauses(splitCostClauses(normalizedInput))
  const extractedAssumptions = []
  const detectedCadence = []
  const detectedDuration = []
  const detectedExplicitCosts = []
  const detectedVisitCounts = []
  let hasFrequencyWithoutExplicitCost = false
  const extractedLineItems = clauses.reduce((items, clause) => {
    const frequencyMatch = getRecurringAnnualOccurrences(clause)
    const costPerVisit = getRecurringCostPerVisit(clause)
    const oneTimeCost = getOneTimeCost(clause)

    if (frequencyMatch !== null) {
      detectedCadence.push(frequencyMatch.assumptionLabel)
      detectedVisitCounts.push(frequencyMatch.annualOccurrences)
    }

    const durationMatch = clause.match(/\bfor\s+(\d+)\s+(weeks?|months?)\b/i)
    if (durationMatch) {
      detectedDuration.push(durationMatch[0].trim())
    }

    if (frequencyMatch !== null && costPerVisit !== null) {
      const annualizedCost = frequencyMatch.annualOccurrences * costPerVisit
      detectedExplicitCosts.push(costPerVisit)
      extractedAssumptions.push(
        `Recurring care: ${frequencyMatch.assumptionLabel} x ${formatWholeDollarAmount(costPerVisit)} = ${formatWholeDollarAmount(annualizedCost)}.`,
      )
      items.push(annualizedCost)
      return items
    }

    if (frequencyMatch !== null && costPerVisit === null) {
      hasFrequencyWithoutExplicitCost = true
    }

    if (oneTimeCost !== null) {
      detectedExplicitCosts.push(oneTimeCost)
      extractedAssumptions.push(`One-time cost: ${formatWholeDollarAmount(oneTimeCost)}.`)
      items.push(oneTimeCost)
      return items
    }

    return items
  }, [])

  const extractedItemCount = extractedLineItems.length
  const extractedAnnualSpend =
    extractedItemCount > 0
      ? extractedLineItems.reduce((total, amount) => total + amount, 0)
      : null
  const fallbackReason =
    extractedItemCount > 0
      ? null
      : hasFrequencyWithoutExplicitCost
        ? 'frequency_without_explicit_cost'
        : 'no_billable_events_detected'

  return {
    estimationMode: extractedItemCount > 0 ? 'extracted' : 'inferred',
    extractedAnnualSpend,
    extractedItemCount,
    hasFuzzyWording: fuzzyEstimatePattern.test(normalizedInput),
    extractedAssumptions,
    fallbackReason,
    parseTrace: {
      normalizedPrompt: normalizedInput,
      detectedCadence,
      detectedDuration,
      detectedExplicitCosts,
      detectedVisitCounts,
      derivedSpend: extractedAnnualSpend,
      fallbackUsed: extractedItemCount === 0,
    },
  }
}

export function buildAiScenarioTrace({
  interpretation,
  coverageType = 'individual',
  userInput = '',
  costEstimate = analyzeScenarioCostEstimate(userInput),
} = {}) {
  const normalizedPrompt = costEstimate.parseTrace?.normalizedPrompt ?? ''
  const chronicConditionTriggered =
    interpretation?.scenarioType === 'chronic_condition' || hasExplicitChronicEvidence(userInput)
  const spendSource =
    costEstimate.estimationMode === 'extracted' ? 'custom_derived' : 'heuristic_fallback'
  const classificationSource =
    costEstimate.estimationMode === 'extracted' ? 'parsed_utilization' : 'heuristic_classification'

  return {
    coverageType,
    normalizedPrompt,
    classificationSource,
    spendSource,
    derivedSpend: costEstimate.extractedAnnualSpend,
    fallbackReason: costEstimate.fallbackReason ?? null,
    normalizedCadence: costEstimate.parseTrace?.detectedCadence ?? [],
    normalizedCostPerVisit: costEstimate.parseTrace?.detectedExplicitCosts ?? [],
    normalizedVisitCount: costEstimate.parseTrace?.detectedVisitCounts ?? [],
    normalizedDuration: costEstimate.parseTrace?.detectedDuration ?? [],
    explicitCostDetected: (costEstimate.parseTrace?.detectedExplicitCosts?.length ?? 0) > 0,
    chronicConditionTriggered,
    fallbackUsed: costEstimate.estimationMode !== 'extracted',
    finalScenario: interpretation?.scenarioType ?? null,
    finalSpend: interpretation?.estimatedAnnualMedicalSpend ?? null,
  }
}

export function extractRecurringAnnualSpend(userInput = '') {
  return analyzeScenarioCostEstimate(userInput).extractedAnnualSpend ?? 0
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
    temperature: 0,
    max_output_tokens: 400,
    instructions: [
      'You are an insurance scenario interpreter.',
      'Translate a plain-English healthcare scenario into structured insurance spending inputs.',
      'You are not the calculator and must not return plan cost comparisons, recommended winners, rankings, or plan totals.',
      'Always respond by calling the provided function exactly once.',
      'Use only these scenario types: custom, healthy, moderate, maternity, chronic_condition, major_event.',
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
    extractedAnnualSpend: null,
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
  // When explicit utilization math is available, this is a custom scenario:
  // classification stays separate from spend derivation, and preset scenario
  // floors never apply.
  let scenarioType = interpretation.scenarioType
  if (costEstimate.estimationMode === 'extracted') {
    scenarioType = 'custom'
  } else if (
    scenarioType === 'chronic_condition' &&
    !hasExplicitChronicEvidence(userInput)
  ) {
    scenarioType = 'moderate'
  }

  const heuristicFallbackEstimate =
    scenarioHeuristicEstimates[coverageType]?.[scenarioType] ?? normalizedModelSpend
  const estimatedAnnualMedicalSpend =
    costEstimate.estimationMode === 'extracted'
      ? normalizedExtractedSpend
      : heuristicFallbackEstimate

  return {
    scenarioType,
    estimatedAnnualMedicalSpend,
    assumptions:
      costEstimate.estimationMode === 'extracted'
        // When we can extract concrete costs, keep the arithmetic-based explanation
        // and do not let the scenario label override the explicit spend.
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
      const interpretation = extractAiScenarioInterpretation(
        openAiPayload,
        normalizeAiScenarioInterpretation,
        payload.coverageType,
        payload.userInput,
      )
      if (shouldLogAiScenarioDebug()) {
        const costEstimate = analyzeScenarioCostEstimate(payload.userInput)
        logEvent('info', 'interpretation_trace', {
          normalizedPrompt: costEstimate.parseTrace?.normalizedPrompt,
          detectedCadence: costEstimate.parseTrace?.detectedCadence ?? [],
          detectedDuration: costEstimate.parseTrace?.detectedDuration ?? [],
          detectedExplicitCosts: costEstimate.parseTrace?.detectedExplicitCosts ?? [],
          derivedSpend: costEstimate.extractedAnnualSpend,
          fallbackUsed: costEstimate.estimationMode !== 'extracted',
          fallbackReason: costEstimate.fallbackReason ?? null,
          finalScenario: interpretation.scenarioType,
          finalSpend: interpretation.estimatedAnnualMedicalSpend,
          spendSource:
            costEstimate.estimationMode === 'extracted'
              ? 'custom_derived'
              : 'heuristic_fallback',
        })
      }
      return interpretation
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
