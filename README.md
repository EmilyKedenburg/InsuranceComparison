# Insurance Comparison

A React + TypeScript + Vite app for comparing health insurance plans across
different annual medical spend scenarios. The app includes a client-side
calculator, break-even analysis, and an optional AI consultant backed by an
Express API.

## What the app does

- Compare `2` to `4` plans side by side
- Switch between `individual` and `family` coverage
- Edit premiums, deductibles, coinsurance, out-of-pocket maximums, employer
  contributions, HSA contributions, and HRA contributions
- Use preset annual spend scenarios or enter a custom annual medical spend
- Generate an AI-assisted annual spend estimate from a plain-English healthcare
  scenario
- Review break-even analysis across a spend range
- Switch plan layouts between grid, scroll, and condensed views

## Important disclaimer

This simulator provides estimates for comparison purposes only. Final premiums,
out-of-pocket costs, and claim payments are determined by the insurance carrier
based on the policy, billed charges, network status, and claims processing.

The AI consultant is not medical advice and does not issue quotes or determine
final plan costs.

## Tech stack

- React 19
- TypeScript
- Vite
- Tailwind CSS
- Express
- Vitest + Testing Library

## Local development

1. Install dependencies:

```bash
npm install
```

2. Copy `.env.example` to `.env` and add your OpenAI API key if you want to use
   the AI consultant.

3. Start the client and backend together:

```bash
npm run dev
```

This starts:

- Vite on the frontend dev server
- The Express backend on `http://localhost:3001`

If you only need one side:

```bash
npm run dev:client
npm run dev:server
```

## Environment variables

The app reads these values from the backend environment:

- `OPENAI_API_KEY`: required for the AI consultant and regression harness
- `OPENAI_MODEL`: optional model override for AI scenario interpretation
- `PORT`: optional backend port, defaults to `3001`
- `AI_SCENARIO_DEBUG`: optional debug logging toggle for the backend

See [.env.example](./.env.example).

## Available scripts

```bash
npm run dev
npm run dev:client
npm run dev:server
npm run build
npm run preview
npm run test
npm run start:server
npm run ai:regression
```

## AI consultant

The AI consultant sends a plain-English healthcare scenario to
`POST /api/ai-scenario`, where the backend validates the payload and requests a
structured interpretation from OpenAI.

Current backend guardrails include:

- Request body size limit of roughly `12kb`
- Maximum of `4` plans per request
- Maximum user scenario length of `1000` characters
- Rate limit of `10` AI scenario requests per minute per IP
- Response shape limited to structured scenario interpretation fields rather than
  final plan recommendations

If `OPENAI_API_KEY` is not configured, the calculator still works, but the AI
consultant endpoint will return an error.

The app UI also states that medical and plan data are not stored in the app or
on the server.

## Calculator features

- Annual total cost calculation from plan inputs and selected spend
- Cheapest-plan detection
- Winner explanation summary
- Break-even chart with shaded winning regions
- Active scenario marker and break-even tooltips
- Preset annual spend buttons for healthy, moderate, and worst-case scenarios

## Default plans

The app starts with these first two sample plans and can expand up to four total
plans:

- `PPO Plan`
- `HDHP Plan`
- `EPO Plan`
- `High Cost Sharing Plan`

Default seed data lives in [src/data/defaultPlans.ts](./src/data/defaultPlans.ts).

## Testing

Run the test suite with:

```bash
npm run test
```

The project includes tests for:

- App integration flows
- Insurance cost calculations
- Validation rules
- Break-even analysis
- AI scenario backend route and service logic

## AI consultant regression harness

Run the batch regression harness against the AI consultant pipeline:

```bash
OPENAI_API_KEY=your_key_here npm run ai:regression
```

Optional environment variables:

- `OPENAI_MODEL` to override the model used by the harness
- `AI_REGRESSION_REPEAT_COUNT` to change the default repeat count of `3`
- `AI_REGRESSION_OUTPUT_DIR` to write reports somewhere other than the repo root

The harness writes:

- `ai-consultant-regression-results.json`
- `ai-consultant-regression-results.csv`
- `ai-consultant-regression-results.md`

It uses the same backend interpretation pipeline and reports trace fields such as:

- scenario classification source
- spend source
- derived spend
- fallback reason
- recurring cadence normalization
- explicit cost detection
- chronic-condition trigger behavior
- repeated-run stability flags
