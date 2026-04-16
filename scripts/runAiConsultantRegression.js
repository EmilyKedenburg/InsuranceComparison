import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import {
  analyzeScenarioCostEstimate,
  buildAiScenarioTrace,
  requestAiScenarioInterpretationFromOpenAi,
} from '../server/aiScenarioService.js'
import { aiConsultantManualRegressionPrompts } from '../tests/fixtures/aiConsultantManualRegressionPrompts.js'

const repeatCount = Number(process.env.AI_REGRESSION_REPEAT_COUNT ?? 3)
const outputDir = process.env.AI_REGRESSION_OUTPUT_DIR
  ? path.resolve(process.cwd(), process.env.AI_REGRESSION_OUTPUT_DIR)
  : process.cwd()
const apiKey = process.env.OPENAI_API_KEY
const model = process.env.OPENAI_MODEL ?? 'gpt-4o-mini'

const plans = [
  {
    name: 'PPO Plan',
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
  {
    name: 'HDHP Plan',
    monthlyPremium: 185,
    individualDeductible: 3200,
    familyDeductible: 6400,
    coinsurance: 10,
    individualOutOfPocketMax: 4500,
    familyOutOfPocketMax: 9000,
    employerContribution: 1800,
    hsaContribution: 1500,
    hraContribution: 0,
  },
]

function csvEscape(value) {
  const stringValue = value == null ? '' : String(value)
  if (/[",\n]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`
  }
  return stringValue
}

function joinList(value) {
  return Array.isArray(value) ? value.join(' | ') : ''
}

function buildNotes(promptConfig, row) {
  const notes = []

  if (promptConfig.expectedScenario && row.scenario !== promptConfig.expectedScenario) {
    notes.push(`expectedScenario:${promptConfig.expectedScenario}`)
  }
  if (promptConfig.shouldBeCustom && row.scenario !== 'custom') {
    notes.push('expectedCustom')
  }
  if (promptConfig.shouldNotBeZero && (!Number.isFinite(row.estimate) || row.estimate <= 0)) {
    notes.push('unexpectedZero')
  }
  if (promptConfig.shouldNotTriggerChronic && row.chronicConditionTriggered) {
    notes.push('unexpectedChronic')
  }
  if (
    Number.isFinite(promptConfig.minReasonableEstimate) &&
    Number.isFinite(row.estimate) &&
    row.estimate < promptConfig.minReasonableEstimate
  ) {
    notes.push(`belowMin:${promptConfig.minReasonableEstimate}`)
  }
  if (
    Number.isFinite(promptConfig.maxReasonableEstimate) &&
    Number.isFinite(row.estimate) &&
    row.estimate > promptConfig.maxReasonableEstimate
  ) {
    notes.push(`aboveMax:${promptConfig.maxReasonableEstimate}`)
  }

  return notes.join('; ')
}

async function runPrompt(promptConfig, runIndex) {
  const payload = {
    userInput: promptConfig.prompt,
    coverageType: 'individual',
    plans,
  }

  const interpretation = await requestAiScenarioInterpretationFromOpenAi({
    payload,
    apiKey,
    model,
  })
  const costEstimate = analyzeScenarioCostEstimate(promptConfig.prompt)
  const trace = buildAiScenarioTrace({
    interpretation,
    coverageType: payload.coverageType,
    userInput: payload.userInput,
    costEstimate,
  })

  return {
    id: promptConfig.id,
    prompt: promptConfig.prompt,
    runIndex,
    scenario: interpretation.scenarioType,
    estimate: interpretation.estimatedAnnualMedicalSpend,
    confidence: interpretation.confidence,
    classificationSource: trace.classificationSource,
    spendSource: trace.spendSource,
    derivedSpend: trace.derivedSpend,
    fallbackReason: trace.fallbackReason,
    normalizedCadence: trace.normalizedCadence,
    normalizedCostPerVisit: trace.normalizedCostPerVisit,
    normalizedVisitCount: trace.normalizedVisitCount,
    normalizedDuration: trace.normalizedDuration,
    explicitCostDetected: trace.explicitCostDetected,
    chronicConditionTriggered: trace.chronicConditionTriggered,
    notes: '',
  }
}

export function summarizeRegressionRows(rows) {
  const countByScenario = rows.reduce((counts, row) => {
    counts[row.scenario] = (counts[row.scenario] ?? 0) + 1
    return counts
  }, {})
  const unstablePromptIds = []
  const rowsByPrompt = new Map()

  for (const row of rows) {
    const current = rowsByPrompt.get(row.id) ?? []
    current.push(row)
    rowsByPrompt.set(row.id, current)
  }

  for (const [id, promptRows] of rowsByPrompt.entries()) {
    const materialSignatures = new Set(
      promptRows.map((row) =>
        JSON.stringify({
          scenario: row.scenario,
          estimate: row.estimate,
          spendSource: row.spendSource,
          classificationSource: row.classificationSource,
          normalizedCadence: row.normalizedCadence,
          normalizedCostPerVisit: row.normalizedCostPerVisit,
          normalizedVisitCount: row.normalizedVisitCount,
          normalizedDuration: row.normalizedDuration,
          fallbackReason: row.fallbackReason,
        }),
      ),
    )
    const confidenceSignatures = new Set(promptRows.map((row) => row.confidence))
    if (materialSignatures.size > 1) {
      unstablePromptIds.push(id)
    }
    for (const row of promptRows) {
      row.hasMaterialOutputVariance = materialSignatures.size > 1
      row.hasConfidenceOnlyVariance =
        materialSignatures.size === 1 && confidenceSignatures.size > 1
      row.stabilityReason =
        materialSignatures.size > 1
          ? 'unstableAcrossRuns'
          : confidenceSignatures.size > 1
            ? 'confidenceVarianceOnly'
            : 'stable'
      row.isStableAcrossRuns = materialSignatures.size === 1
    }
  }

  const estimates = rows
    .map((row) => row.estimate)
    .filter((value) => Number.isFinite(value))
  const nonZeroEstimates = estimates.filter((value) => value > 0)

  return {
    repeatCount,
    promptCount: rowsByPrompt.size,
    rowCount: rows.length,
    countByScenario,
    zeroEstimateCount: rows.filter((row) => row.estimate === 0).length,
    customDerivedCount: rows.filter((row) => row.spendSource === 'custom_derived').length,
    chronicConditionCount: rows.filter((row) => row.scenario === 'chronic_condition').length,
    trueUnstablePromptCount: unstablePromptIds.length,
    confidenceVarianceOnlyCount: Array.from(rowsByPrompt.values()).filter((promptRows) =>
      promptRows.some((row) => row.hasConfidenceOnlyVariance),
    ).length,
    unstablePromptIds,
    highestEstimate: estimates.length > 0 ? Math.max(...estimates) : null,
    lowestNonZeroEstimate: nonZeroEstimates.length > 0 ? Math.min(...nonZeroEstimates) : null,
  }
}

function buildCsv(rows) {
  const headers = [
    'id',
    'prompt',
    'runIndex',
    'scenario',
    'estimate',
    'confidence',
    'classificationSource',
    'spendSource',
    'derivedSpend',
    'fallbackReason',
    'normalizedCadence',
    'normalizedCostPerVisit',
    'normalizedVisitCount',
    'normalizedDuration',
    'explicitCostDetected',
    'chronicConditionTriggered',
    'isStableAcrossRuns',
    'stabilityReason',
    'hasMaterialOutputVariance',
    'hasConfidenceOnlyVariance',
    'notes',
  ]

  const lines = [
    headers.join(','),
    ...rows.map((row) =>
      [
        row.id,
        row.prompt,
        row.runIndex,
        row.scenario,
        row.estimate,
        row.confidence,
        row.classificationSource,
        row.spendSource,
        row.derivedSpend,
        row.fallbackReason,
        joinList(row.normalizedCadence),
        joinList(row.normalizedCostPerVisit),
        joinList(row.normalizedVisitCount),
        joinList(row.normalizedDuration),
        row.explicitCostDetected,
        row.chronicConditionTriggered,
        row.isStableAcrossRuns,
        row.stabilityReason,
        row.hasMaterialOutputVariance,
        row.hasConfidenceOnlyVariance,
        row.notes,
      ]
        .map(csvEscape)
        .join(','),
    ),
  ]

  return lines.join('\n')
}

function buildMarkdown(summary, rows) {
  const suspiciousRows = rows.filter(
    (row) =>
      row.hasMaterialOutputVariance ||
      row.hasConfidenceOnlyVariance ||
      row.estimate === 0 ||
      row.scenario === 'chronic_condition' ||
      row.notes,
  )

  return [
    '# AI Consultant Regression Report',
    '',
    `- Prompt count: ${summary.promptCount}`,
    `- Repeat count: ${summary.repeatCount}`,
    `- Zero estimates: ${summary.zeroEstimateCount}`,
    `- Custom-derived rows: ${summary.customDerivedCount}`,
    `- Chronic-condition rows: ${summary.chronicConditionCount}`,
    `- True unstable prompts: ${summary.trueUnstablePromptCount}`,
    `- Confidence-only variance prompts: ${summary.confidenceVarianceOnlyCount}`,
    `- Highest estimate: ${summary.highestEstimate ?? 'n/a'}`,
    `- Lowest nonzero estimate: ${summary.lowestNonZeroEstimate ?? 'n/a'}`,
    '',
    '## Count By Scenario',
    '',
    ...Object.entries(summary.countByScenario).map(([scenario, count]) => `- ${scenario}: ${count}`),
    '',
    '## Suspicious Results',
    '',
    '| ID | Run | Scenario | Estimate | Spend Source | Stability | Notes |',
    '| --- | --- | --- | ---: | --- | --- | --- |',
    ...suspiciousRows.map(
      (row) =>
        `| ${row.id} | ${row.runIndex} | ${row.scenario} | ${row.estimate} | ${row.spendSource} | ${row.stabilityReason} | ${row.notes || ''} |`,
    ),
    '',
  ].join('\n')
}

async function main() {
  if (!apiKey) {
    console.error('Missing OPENAI_API_KEY. Set it before running the AI consultant regression harness.')
    process.exit(1)
  }

  const rows = []

  for (const promptConfig of aiConsultantManualRegressionPrompts) {
    for (let runIndex = 1; runIndex <= repeatCount; runIndex += 1) {
      const row = await runPrompt(promptConfig, runIndex)
      row.notes = buildNotes(promptConfig, row)
      rows.push(row)
    }
  }

  const summary = summarizeRegressionRows(rows)
  for (const row of rows) {
    const promptConfig = aiConsultantManualRegressionPrompts.find((prompt) => prompt.id === row.id)
    row.notes = buildNotes(promptConfig ?? {}, row)
    if (row.hasMaterialOutputVariance) {
      row.notes = row.notes ? `${row.notes}; unstableAcrossRuns` : 'unstableAcrossRuns'
    } else if (row.hasConfidenceOnlyVariance) {
      row.notes = row.notes
        ? `${row.notes}; confidenceVarianceOnly`
        : 'confidenceVarianceOnly'
    }
  }

  await mkdir(outputDir, { recursive: true })

  const jsonPath = path.join(outputDir, 'ai-consultant-regression-results.json')
  const csvPath = path.join(outputDir, 'ai-consultant-regression-results.csv')
  const mdPath = path.join(outputDir, 'ai-consultant-regression-results.md')

  await writeFile(
    jsonPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        model,
        repeatCount,
        prompts: aiConsultantManualRegressionPrompts,
        summary,
        results: rows,
      },
      null,
      2,
    ),
    'utf8',
  )
  await writeFile(csvPath, buildCsv(rows), 'utf8')
  await writeFile(mdPath, buildMarkdown(summary, rows), 'utf8')

  console.log(`Wrote regression results to ${jsonPath}`)
  console.log(`Wrote regression results to ${csvPath}`)
  console.log(`Wrote regression results to ${mdPath}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  })
}
