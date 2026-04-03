import type {
  ScenarioInterpretationRequest,
  ScenarioInterpretation,
} from '../types/consultant'

export async function interpretScenario(
  request: ScenarioInterpretationRequest,
): Promise<ScenarioInterpretation> {
  const response = await fetch('/api/ai-scenario', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  })

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as
      | { error?: string }
      | null

    throw new Error(payload?.error ?? 'Unable to interpret the scenario right now.')
  }

  return (await response.json()) as ScenarioInterpretation
}
