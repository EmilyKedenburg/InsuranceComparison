# Insurance Comparison

A React + TypeScript + Vite + Tailwind CSS starter app for comparing two insurance
plans based on annual medical spend.

## Run locally

```bash
npm install
npm run dev
```

## Current scope

- Two-plan comparison form
- Pure annual cost calculation engine
- Cheaper-plan highlight
- No external APIs

## AI Consultant Regression Harness

Run the batch regression harness against the production AI consultant pipeline:

```bash
OPENAI_API_KEY=your_key_here npm run ai:regression
```

Optional environment variables:

- `OPENAI_MODEL` to override the model used by the harness
- `AI_REGRESSION_REPEAT_COUNT` to change the default repeat count of `3`
- `AI_REGRESSION_OUTPUT_DIR` to write the reports somewhere other than the repo root

The harness writes:

- `ai-consultant-regression-results.json`
- `ai-consultant-regression-results.csv`
- `ai-consultant-regression-results.md`

It reuses the same backend AI consultant pipeline as the app and includes prompt-level trace fields such as cadence, explicit cost detection, fallback reason, spend source, and repeated-run stability flags.
