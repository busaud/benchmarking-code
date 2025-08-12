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

## Notes

- Keep prompts deterministic and outputs constrained. The runner enforces a code-only fenced block.
- Extend with more tasks by adding files in `bench/tasks/` and registering in `bench/tasks/index.js`.
