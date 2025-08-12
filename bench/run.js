const fs = require("fs");
const path = require("path");
const client = require("./openaiClient");
const buildPrompt = require("./prompt");
const models = require("./models");
const tasks = require("./tasks");
const { extractFirstJsBlock } = require("./extractCodeBlock");
const { validateEndpoint } = require("./validators");

const ROUNDS = parseInt(process.env.ROUNDS || "10", 10);

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

function inferDifficulty(taskId) {
    if (/_extra_hard$/i.test(taskId)) return "extra_hard";
    if (/_hard$/i.test(taskId)) return "hard";
    return "basic";
}

async function run() {
    const genRoot = path.join(process.cwd(), "generated");
    await ensureDir(genRoot);

    const results = [];

    // Build difficulty map from tasks (infer from id when not provided)
    const difficultyByTask = {};
    for (const t of tasks) difficultyByTask[t.id] = inferDifficulty(t.id);

    for (const modelEntry of models) {
        const modelDir = path.join(genRoot, modelEntry.name);
        await ensureDir(modelDir);

        for (const task of tasks) {
            const prompt = buildPrompt(task);

            for (let attempt = 1; attempt <= ROUNDS; attempt += 1) {
                let content;
                let code;
                let filepath;
                let status = "ok";
                let errorMessage = null;
                let passed = false;
                const t0 = Date.now();

                const baseName = `${task.id}_${attempt}`;
                const detailPath = path.join(modelDir, `${baseName}.detail.json`);
                const rawPath = path.join(modelDir, `${baseName}.raw.txt`);
                let stage = "call";
                let validation = null;

                try {
                    stage = "call";
                    content = await callModel({ model: modelEntry.model, prompt });

                    stage = "extract";
                    code = extractFirstJsBlock(content);
                    if (!code) {
                        await fs.promises.writeFile(rawPath, String(content || ""), "utf8");
                        throw new Error("No JS code block found");
                    }

                    stage = "write";
                    filepath = path.join(modelDir, `${task.id}_${attempt}.js`);
                    await fs.promises.writeFile(filepath, code, "utf8");

                    stage = "require";
                    // eslint-disable-next-line import/no-dynamic-require, global-require
                    const app = require(filepath);

                    stage = "validate";
                    validation = await validateEndpoint(app, task);
                    passed = validation.allPassed === true;

                    // Persist validation detail for debugging on success as well
                    await fs.promises.writeFile(
                        detailPath,
                        JSON.stringify(
                            { task: task.id, attempt, model: modelEntry.name, stage, validation },
                            null,
                            2
                        )
                    );

                    if (!passed) {
                        status = "error";
                        const failedIdx = validation.caseResults
                            .filter((c) => !c.passed)
                            .map((c) => c.index)
                            .join(", ");
                        errorMessage = failedIdx ? `Failed cases: ${failedIdx}` : "Validation failed";
                    }
                } catch (err) {
                    status = "error";
                    errorMessage = err?.message || String(err);
                    // Always persist detail on error with stage info
                    const detail = {
                        task: task.id,
                        attempt,
                        model: modelEntry.name,
                        stage,
                        error: errorMessage,
                    };
                    if (stage === "extract") detail.rawSavedTo = rawPath;
                    try {
                        await fs.promises.writeFile(detailPath, JSON.stringify(detail, null, 2));
                    } catch (_) {}
                }

                const durationMs = Date.now() - t0;

                results.push({
                    model: modelEntry.name,
                    task: task.id,
                    attempt,
                    status,
                    file: filepath || null,
                    error: errorMessage,
                    passed,
                    durationMs,
                    detail: detailPath,
                    raw: code ? undefined : rawPath,
                    difficulty: difficultyByTask[task.id],
                });
            }
        }
    }

    // Aggregate stats per model/task
    const stats = {};
    for (const r of results) {
        if (!stats[r.model]) stats[r.model] = {};
        if (!stats[r.model][r.task]) stats[r.model][r.task] = { success: 0, attempts: 0, totalMs: 0 };
        stats[r.model][r.task].attempts += 1;
        stats[r.model][r.task].totalMs += r.durationMs || 0;
        if (r.status === "ok" && r.passed) stats[r.model][r.task].success += 1;
    }

    /**
     * modeTaskStats is a map of model name to a map of task id to stats
     * modeTaskStats[model][taskId] = {
     *  success: number,
     *  attempts: number,
     *  totalMs: number,
     *  percent: number,
     *  avgMs: number
     * }
     */
    const modeTaskStats = {};
    for (const [model, tasksMap] of Object.entries(stats)) {
        modeTaskStats[model] = {};
        for (const [taskId, s] of Object.entries(tasksMap)) {
            const percent = s.attempts > 0 ? Math.round((s.success / s.attempts) * 1000) / 10 : 0; // one decimal
            const avgMs = s.attempts > 0 ? Math.round(s.totalMs / s.attempts) : 0;
            modeTaskStats[model][taskId] = { ...s, percent, avgMs };
        }
    }

    const summary = { rounds: ROUNDS, results, stats: modeTaskStats };
    const summaryPath = path.join(genRoot, "summary.json");
    await fs.promises.writeFile(summaryPath, JSON.stringify(summary, null, 2));

    // Print concise per-task table
    const tableRows = [];
    for (const [model, tasksMap] of Object.entries(modeTaskStats)) {
        for (const [taskId, s] of Object.entries(tasksMap)) {
            tableRows.push({
                model,
                task: taskId,
                success: `${s.success}/${s.attempts}`,
                percent: `${s.percent}%`,
                avgMs: s.avgMs,
            });
        }
    }
    console.log("Benchmark results written to", summaryPath);
    console.table(tableRows);

    // Print combined summary for task families (create_user*, sum*) with avg time (sec)
    const fixedRows = [];
    for (const [model, tasksMap] of Object.entries(modeTaskStats)) {
        let cuSuccess = 0,
            cuAttempts = 0,
            cuTotalMs = 0;
        let smSuccess = 0,
            smAttempts = 0,
            smTotalMs = 0;
        for (const [taskId, s] of Object.entries(tasksMap)) {
            if (taskId.startsWith("create_user")) {
                cuSuccess += s.success;
                cuAttempts += s.attempts;
                cuTotalMs += s.totalMs || 0;
            } else if (taskId.startsWith("sum")) {
                smSuccess += s.success;
                smAttempts += s.attempts;
                smTotalMs += s.totalMs || 0;
            }
        }
        const cuPct = cuAttempts ? Math.round((cuSuccess / cuAttempts) * 1000) / 10 : 0;
        const smPct = smAttempts ? Math.round((smSuccess / smAttempts) * 1000) / 10 : 0;
        const totalMs = cuTotalMs + smTotalMs;
        const totalAttempts = cuAttempts + smAttempts;
        const avgSec = totalAttempts ? Math.round((totalMs / totalAttempts / 1000) * 100) / 100 : 0;
        fixedRows.push({ model, create_user: `${cuPct}%`, sum: `${smPct}%`, avgTimeSec: avgSec });
    }
    console.log("Per model summary (create_user*, sum*, avg time in seconds):");
    console.table(fixedRows);

    // Print by difficulty summary
    const diffRows = [];
    for (const [model, tasksMap] of Object.entries(modeTaskStats)) {
        let basicSuccess = 0,
            basicAttempts = 0;
        let hardSuccess = 0,
            hardAttempts = 0;
        let extraSuccess = 0,
            extraAttempts = 0;
        for (const [taskId, s] of Object.entries(tasksMap)) {
            if (difficultyByTask[taskId] === "basic") {
                basicSuccess += s.success;
                basicAttempts += s.attempts;
            } else if (difficultyByTask[taskId] === "hard") {
                hardSuccess += s.success;
                hardAttempts += s.attempts;
            } else if (difficultyByTask[taskId] === "extra_hard") {
                extraSuccess += s.success;
                extraAttempts += s.attempts;
            }
        }
        const basicPct = basicAttempts ? Math.round((basicSuccess / basicAttempts) * 1000) / 10 : 0;
        const hardPct = hardAttempts ? Math.round((hardSuccess / hardAttempts) * 1000) / 10 : 0;
        const extraPct = extraAttempts ? Math.round((extraSuccess / extraAttempts) * 1000) / 10 : 0;
        diffRows.push({ model, basic: `${basicPct}%`, hard: `${hardPct}%`, extra_hard: `${extraPct}%` });
    }
    console.log("Per model summary by difficulty (basic, hard, extra_hard):");
    console.table(diffRows);
}

run().catch((err) => {
    console.error("Benchmark run failed:", err);
    process.exit(1);
});
