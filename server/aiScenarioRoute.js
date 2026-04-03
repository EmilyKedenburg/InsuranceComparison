import express from 'express'
import rateLimit from 'express-rate-limit'
import {
  logAiScenarioEvent,
  requestAiScenarioInterpretationFromOpenAi,
  validateAiScenarioPayload,
} from './aiScenarioService.js'

function getEnvironmentValue(name) {
  return process.env[name]
}

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many AI scenario requests. Please wait a minute and try again.',
  },
})

export function createAiScenarioHandler({
  fetchImpl = fetch,
  getEnvValue = getEnvironmentValue,
  logEvent = logAiScenarioEvent,
} = {}) {
  return async (request, response) => {
    logEvent('info', 'request_received', {
      ip: request.ip ?? 'unknown',
      coverageType: request.body?.coverageType,
      planCount: Array.isArray(request.body?.plans) ? request.body.plans.length : 0,
      userInputLength: typeof request.body?.userInput === 'string' ? request.body.userInput.length : 0,
    })

    const validationError = validateAiScenarioPayload(request.body)

    if (validationError) {
      logEvent('warn', 'validation_failed', {
        ip: request.ip ?? 'unknown',
        error: validationError,
      })
      response.status(400).json({ error: validationError })
      return
    }

    const openAiApiKey = getEnvValue('OPENAI_API_KEY')

    if (!openAiApiKey) {
      response.status(500).json({
        error: 'Missing OPENAI_API_KEY. Add it to your backend environment to use the consultant.',
      })
      return
    }

    try {
      const interpretation = await requestAiScenarioInterpretationFromOpenAi({
        payload: request.body,
        apiKey: openAiApiKey,
        model: getEnvValue('OPENAI_MODEL') ?? 'gpt-4o-mini',
        fetchImpl,
        logEvent,
      })

      logEvent('info', 'successful_response', {
        scenarioType: interpretation.scenarioType,
        estimatedAnnualMedicalSpend: interpretation.estimatedAnnualMedicalSpend,
        confidence: interpretation.confidence,
      })
      response.json(interpretation)
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Unable to interpret the scenario right now.'
      const errorCode =
        error instanceof Error && 'code' in error
          ? String(error.code)
          : null

      if (errorCode === 'missing_tool_call') {
        logEvent('warn', 'missing_tool_call', { message })
      } else if (errorCode === 'normalization_failed') {
        logEvent('warn', 'normalization_failed', { message })
      } else if (errorCode === 'forbidden_output') {
        logEvent('warn', 'forbidden_output', { message })
      } else if (/took too long/i.test(message)) {
        logEvent('warn', 'openai_timeout', { message })
      } else {
        logEvent('error', 'openai_request_failed', { message })
      }

      response.status(502).json({ error: message })
    }
  }
}

export const aiScenarioRouter = express.Router()

aiScenarioRouter.use(limiter)
aiScenarioRouter.post('/', createAiScenarioHandler())
