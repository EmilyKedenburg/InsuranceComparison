import type { CoverageType, InsurancePlan } from './insurance';
export type ScenarioType = 'healthy' | 'moderate' | 'maternity' | 'chronic_condition' | 'major_event';
export interface ScenarioInterpretation {
    scenarioType: ScenarioType;
    estimatedAnnualMedicalSpend: number;
    assumptions: string[];
    confidence: number;
}
export interface ScenarioInterpretationRequest {
    scenarioDescription: string;
    coverageType: CoverageType;
    plans: InsurancePlan[];
}
export interface ScenarioInterpretationResponse {
    interpretation: ScenarioInterpretation;
}
