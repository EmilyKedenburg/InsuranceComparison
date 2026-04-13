import type { ScenarioInterpretation, ScenarioInterpretationRequest } from '../types/consultant';
import type { CoverageType } from '../types/insurance';
export declare const interpretScenarioToolName = "interpret_insurance_scenario";
export declare const consultantDisclaimer = "This is a financial simulation, not medical advice. Final costs depend on your insurer, the care you receive, and how claims are processed.";
export declare function buildScenarioInterpretationPrompt(request: ScenarioInterpretationRequest): string;
export declare function buildScenarioInterpretationRequest(request: ScenarioInterpretationRequest, model?: string): {
    model: string;
    instructions: string;
    input: string;
    tool_choice: {
        type: string;
        name: string;
    };
    tools: {
        type: string;
        name: string;
        description: string;
        strict: boolean;
        parameters: {
            type: string;
            additionalProperties: boolean;
            required: string[];
            properties: {
                scenarioType: {
                    type: string;
                    enum: string[];
                };
                estimatedAnnualMedicalSpend: {
                    type: string;
                    minimum: number;
                };
                assumptions: {
                    type: string;
                    items: {
                        type: string;
                    };
                };
                confidence: {
                    type: string;
                    minimum: number;
                    maximum: number;
                };
            };
        };
    }[];
};
export declare function normalizeScenarioInterpretation(interpretation: ScenarioInterpretation, coverageType?: CoverageType): ScenarioInterpretation;
export declare function extractScenarioInterpretation(response: {
    output?: Array<{
        type?: string;
        name?: string;
        arguments?: string;
    }>;
}): ScenarioInterpretation;
