export const interpretScenarioToolName = 'interpret_insurance_scenario';
export const consultantDisclaimer = 'This is a financial simulation, not medical advice. Final costs depend on your insurer, the care you receive, and how claims are processed.';
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
};
export function buildScenarioInterpretationPrompt(request) {
    return [
        `Coverage type: ${request.coverageType}`,
        `Current plans: ${JSON.stringify(request.plans)}`,
        `User scenario: ${request.scenarioDescription}`,
    ].join('\n\n');
}
export function buildScenarioInterpretationRequest(request, model = 'gpt-5-mini') {
    return {
        model,
        instructions: [
            'You are an insurance scenario interpreter.',
            'Your job is to translate a plain-English healthcare scenario into structured insurance spending inputs.',
            'You are not the calculator and must not return plan cost comparisons or final plan totals.',
            'Always respond by calling the provided function exactly once.',
            'Use only these scenario types: healthy, moderate, maternity, chronic_condition, major_event.',
            'Confidence must be a number from 0 to 1.',
            'Assumptions should be short, concrete, and user-friendly.',
        ].join(' '),
        input: buildScenarioInterpretationPrompt(request),
        tool_choice: {
            type: 'function',
            name: interpretScenarioToolName,
        },
        tools: [
            {
                type: 'function',
                name: interpretScenarioToolName,
                description: 'Interpret a healthcare scenario into structured insurance spending assumptions.',
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
                            enum: [
                                'healthy',
                                'moderate',
                                'maternity',
                                'chronic_condition',
                                'major_event',
                            ],
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
    };
}
export function normalizeScenarioInterpretation(interpretation, coverageType = 'individual') {
    const normalizedSpend = Math.max(0, Number.isFinite(interpretation.estimatedAnnualMedicalSpend)
        ? interpretation.estimatedAnnualMedicalSpend
        : 0);
    return {
        scenarioType: interpretation.scenarioType,
        estimatedAnnualMedicalSpend: Math.max(normalizedSpend, scenarioSpendFloors[coverageType][interpretation.scenarioType]),
        assumptions: interpretation.assumptions.filter(Boolean),
        confidence: Math.min(1, Math.max(0, Number.isFinite(interpretation.confidence) ? interpretation.confidence : 0)),
    };
}
export function extractScenarioInterpretation(response) {
    const toolCall = response.output?.find((item) => item.type === 'function_call' && item.name === interpretScenarioToolName);
    if (!toolCall?.arguments) {
        throw new Error('The AI response did not include the required scenario tool call.');
    }
    return normalizeScenarioInterpretation(JSON.parse(toolCall.arguments));
}
