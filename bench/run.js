const fs = require("fs");
const path = require("path");
const client = require("./openaiClient");
const buildPrompt = require("./prompt");
const models = require("./models");
const tasks = require("./tasks");
const { extractFirstJsBlock } = require("./extractCodeBlock");
const { validateEndpoint } = require("./validators");

async function ensureDir(dir) {
    await fs.promises.mkdir(dir, { recursive: true });
}

async function callModel({ model, prompt }) {
    const completion = await client.chat.completions.create({
        model,
        messages: [
            { role: "system", content: "You are a precise code generator." },
            { role: "user", content: prompt },
        ],
        temperature: 0,
    });
    return completion.choices?.[0]?.message?.content || "";
}

async function run() {
    const outRoot = path.join(process.cwd(), "generated");
    await ensureDir(outRoot);

    const results = [];

    for (const modelEntry of models) {
        const modelDir = path.join(outRoot, modelEntry.name);
        await ensureDir(modelDir);

        for (const task of tasks) {
            const prompt = buildPrompt(task);
            let content;
            let code;
            let filepath;
            let status = "ok";
            let errorMessage = null;
            let passed = false;

            try {
                content = await callModel({ model: modelEntry.model, prompt });
                code = extractFirstJsBlock(content);
                if (!code) {
                    throw new Error("No JS code block found");
                }
                filepath = path.join(modelDir, `${task.id}.js`);
                await fs.promises.writeFile(filepath, code, "utf8");

                // Validate by requiring the generated app and running declarative checks
                // eslint-disable-next-line import/no-dynamic-require, global-require
                const app = require(filepath);
                await validateEndpoint(app, task);
                passed = true;
            } catch (err) {
                status = "error";
                errorMessage = err?.message || String(err);
            }

            results.push({
                model: modelEntry.name,
                task: task.id,
                status,
                file: filepath || null,
                error: errorMessage,
                passed,
            });
        }
    }

    const summaryPath = path.join(outRoot, "summary.json");
    await fs.promises.writeFile(summaryPath, JSON.stringify(results, null, 2));

    console.log("Benchmark results written to", summaryPath);
    console.table(results.map((r) => ({ model: r.model, task: r.task, status: r.status })));
}

run().catch((err) => {
    console.error("Benchmark run failed:", err);
    process.exit(1);
});
