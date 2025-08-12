# API Coding Benchmark (Cerebras via OpenAI client)

Minimal harness to benchmark LLMs on generating Node.js + Express API endpoints.

## Stack

- Node.js, Express
- OpenAI-compatible client
- Supertest-based validators (no unit test harness)

## Setup

1. Create `.env` with your Cerebras credentials:

```
OPENAI_API_KEY=key
OPENAI_BASE_URL=https://url/v1
```

2. Install deps:

```
npm install
```

## Run

- Execute a benchmark run:

```
npm run bench
```

- You can configure rounds and pass@k values via env vars. `PASS_AT_KS` is a comma-separated list of k values (defaults to `1,5,10`). The largest `k` must be ≤ `ROUNDS`; larger values are ignored with a warning.

```
cross-env ROUNDS=20 PASS_AT_KS=1,5,10 npm run bench
```

## Models

Configure in `bench/models.js`. Example:

```
module.exports = [
  { name: 'gpt-oss', model: 'gpt-oss-20b' },
  { name: 'qwen3', model: 'qwen3-235B' }
];
```

## Tasks

Defined in `bench/tasks/`. Each task:

- Provides a prompt instructing the model to output runnable Express endpoint code
- Runner writes code to `generated/<model>/<task>.js`
- Validator imports endpoint and validates behavior

## Running generated endpoints manually (PORT_RUN)

- The harness imports apps and does not want them to bind to a port. Generated code is prompted to only call `app.listen(...)` when `process.env.PORT_RUN` is set.
- During benchmarking, `PORT_RUN` is not set. To run a generated endpoint locally:

PowerShell (Windows):

```
$env:PORT_RUN=3000; node generated/<model>/<task>.js
```

Bash:

```
PORT_RUN=3000 node generated/<model>/<task>.js
```

## Notes

- Keep prompts deterministic and outputs constrained. The runner enforces a code-only fenced block.
- Extend with more tasks by adding files in `bench/tasks/` and registering in `bench/tasks/index.js`.
- The summary (`generated/summary.json`) includes pass@k per model/task under `stats[model][task].passAt` and the list of ks under `passAtKs`.
