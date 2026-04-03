import { buildScenarioInterpretationRequest, extractScenarioInterpretation, } from '../src/lib/consultant';
function getEnvironmentValue(name) {
    const env = globalThis.process?.env ?? {};
    return env[name];
}
async function readJsonBody(request) {
    const chunks = [];
    await new Promise((resolve, reject) => {
        request.on('data', (chunk) => {
            chunks.push(chunk?.toString() ?? '');
        });
        request.on('end', () => resolve());
        request.on('error', reject);
    });
    return JSON.parse(chunks.join(''));
}
function sendJson(response, statusCode, payload) {
    response.statusCode = statusCode;
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify(payload));
}
export async function handleConsultantInterpretRequest(request, response) {
    if (request.method !== 'POST') {
        sendJson(response, 405, { error: 'Method not allowed.' });
        return;
    }
    const openAiApiKey = getEnvironmentValue('OPENAI_API_KEY');
    if (!openAiApiKey) {
        sendJson(response, 500, {
            error: 'Missing OPENAI_API_KEY. Add it to your environment to use the consultant.',
        });
        return;
    }
    try {
        const payload = await readJsonBody(request);
        const openAiRequest = buildScenarioInterpretationRequest(payload, getEnvironmentValue('OPENAI_MODEL') ?? 'gpt-5-mini');
        const openAiResponse = await fetch('https://api.openai.com/v1/responses', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${openAiApiKey}`,
            },
            body: JSON.stringify(openAiRequest),
        });
        if (!openAiResponse.ok) {
            const errorText = await openAiResponse.text();
            sendJson(response, 502, {
                error: `OpenAI request failed: ${errorText}`,
            });
            return;
        }
        const openAiPayload = (await openAiResponse.json());
        const interpretation = extractScenarioInterpretation(openAiPayload);
        const result = { interpretation };
        sendJson(response, 200, result);
    }
    catch (error) {
        sendJson(response, 500, {
            error: error instanceof Error
                ? error.message
                : 'Unable to interpret the scenario right now.',
        });
    }
}
