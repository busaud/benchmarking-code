const fs = require("fs");
const path = require("path");
const client = require("./openaiClient");
const buildPrompt = require("./prompt");
const models = require("./models");
const tasks = require("./tasks");
const { extractFirstJsBlock } = require("./extractCodeBlock");
const { validateEndpoint, validateReactComponent } = require("./validators");

// Prevent the benchmark process from exiting prematurely due to uncaught errors in generated code
process.on("uncaughtException", (err) => {
    console.error("[global] Uncaught exception captured:", err);
});
process.on("unhandledRejection", (reason) => {
    console.error("[global] Unhandled promise rejection captured:", reason);
});

const ROUNDS = parseInt(process.env.ROUNDS || "10", 10);
// Comma-separated list of k values for pass@k (e.g., "1,5,10")
const PASS_AT_KS_REQUESTED = (process.env.PASS_AT_KS || "1,5,10")
    .split(",")
    .map((s) => parseInt(String(s).trim(), 10))
    .filter((n) => Number.isFinite(n) && n > 0);
const UNIQUE_SORTED_KS = Array.from(new Set(PASS_AT_KS_REQUESTED)).sort((a, b) => a - b);
// Enforce k <= ROUNDS
let PASS_AT_KS = UNIQUE_SORTED_KS.filter((k) => k <= ROUNDS);
const DROPPED_KS = UNIQUE_SORTED_KS.filter((k) => k > ROUNDS);
if (DROPPED_KS.length > 0) {
    console.warn(
        `[pass@k] Dropping k values greater than ROUNDS (${ROUNDS}): ${DROPPED_KS.join(", ")}. Using ks: ${PASS_AT_KS.join(", ")}`
    );
}
if (PASS_AT_KS.length === 0 && ROUNDS >= 1) PASS_AT_KS = [1];

function roundToOneDecimal(num) {
    return Math.round(num * 10) / 10;
}

/**
 * The unbiased pass@'k estimator: 1 - C(n-c, k) / C(n, k)
 * n: total attempts
 * c: number of successes
 * k: pass@'k value
 *
 * @param {number} totalAttempts
 * @param {number} numSuccesses
 * @param {number} k
 * @returns {number}
 */
function estimatePassAtK(totalAttempts, numSuccesses, k) {
    const n = totalAttempts | 0;
    const c = numSuccesses | 0;
    if (n <= 0 || k <= 0) return 0;
    const kk = Math.min(k, n);
    if (c <= 0) return 0;
    if (c >= n) return 1;
    // If kk > n - c, then C(n-c, kk) = 0 => pass@k = 1
    if (kk > n - c) return 1;
    // Compute ratio C(n-c, kk) / C(n, kk) without large intermediates
    let ratio = 1;
    for (let i = 0; i < kk; i += 1) {
        ratio *= (n - c - i) / (n - i);
    }
    const p = 1 - ratio;
    return p < 0 ? 0 : p > 1 ? 1 : p;
}

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
        temperature: 0.8,
    });
    return completion.choices?.[0]?.message?.content || "";
}

function inferDifficulty(taskId) {
    if (/_extra_hard$/i.test(taskId)) return "extra_hard";
    if (/_hard$/i.test(taskId)) return "hard";
    return "basic";
}

async function run() {
    const benchmarkStart = Date.now();
    const genRoot = path.join(process.cwd(), "generated");
    await ensureDir(genRoot);

    const results = [];

    // Build difficulty map from tasks (infer from id when not provided)
    const difficultyByTask = {};
    for (const t of tasks) difficultyByTask[t.id] = inferDifficulty(t.id);

    const totalIterations = models.length * tasks.length * ROUNDS;
    let completedIterations = 0;

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
                    const exported = require(filepath);

                    stage = "validate";
                    if (task.type === "react_component") {
                        validation = await validateReactComponent(exported, task);
                    } else {
                        validation = await validateEndpoint(exported, task);
                    }
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

                completedIterations += 1;
                const progressPct = Math.round((completedIterations / totalIterations) * 1000) / 10; // one decimal
                process.stdout.write(
                    `\rProgress: ${progressPct}% (${completedIterations}/${totalIterations})`
                );
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
            const passAt = {};
            for (const k of PASS_AT_KS) {
                const p = estimatePassAtK(s.attempts, s.success, k);
                passAt[k] = roundToOneDecimal(p * 100); // percentage one decimal
            }
            modeTaskStats[model][taskId] = { ...s, percent, avgMs, passAt };
        }
    }

    const summary = {
        rounds: ROUNDS,
        requestedPassAtKs: UNIQUE_SORTED_KS,
        passAtKs: PASS_AT_KS,
        results,
        stats: modeTaskStats,
    };
    const summaryPath = path.join(genRoot, "summary.json");
    await fs.promises.writeFile(summaryPath, JSON.stringify(summary, null, 2));

    // Print concise per-task table
    const tableRows = [];
    for (const [model, tasksMap] of Object.entries(modeTaskStats)) {
        for (const [taskId, s] of Object.entries(tasksMap)) {
            const row = {
                model,
                task: taskId,
                success: `${s.success}/${s.attempts}`,
                percent: `${s.percent}%`,
                avgMs: s.avgMs,
            };
            for (const k of PASS_AT_KS) {
                if (k === 1) continue; // percent already covers pass@1
                row[`p@${k}`] = `${s.passAt[k]}%`;
            }
            tableRows.push(row);
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
        const cuPassAtSums = {};
        const cuPassAtCounts = {};
        const smPassAtSums = {};
        const smPassAtCounts = {};
        for (const k of PASS_AT_KS) {
            if (k === 1) continue;
            cuPassAtSums[k] = 0;
            cuPassAtCounts[k] = 0;
            smPassAtSums[k] = 0;
            smPassAtCounts[k] = 0;
        }
        for (const [taskId, s] of Object.entries(tasksMap)) {
            if (taskId.startsWith("endpoint_create_user") || taskId.startsWith("create_user")) {
                cuSuccess += s.success;
                cuAttempts += s.attempts;
                cuTotalMs += s.totalMs || 0;
                for (const k of PASS_AT_KS) {
                    if (k === 1) continue;
                    if (typeof s.passAt?.[k] === "number") {
                        cuPassAtSums[k] += s.passAt[k];
                        cuPassAtCounts[k] += 1;
                    }
                }
            } else if (taskId.startsWith("endpoint_sum") || taskId.startsWith("sum")) {
                smSuccess += s.success;
                smAttempts += s.attempts;
                smTotalMs += s.totalMs || 0;
                for (const k of PASS_AT_KS) {
                    if (k === 1) continue;
                    if (typeof s.passAt?.[k] === "number") {
                        smPassAtSums[k] += s.passAt[k];
                        smPassAtCounts[k] += 1;
                    }
                }
            }
        }
        const cuPct = cuAttempts ? Math.round((cuSuccess / cuAttempts) * 1000) / 10 : 0;
        const smPct = smAttempts ? Math.round((smSuccess / smAttempts) * 1000) / 10 : 0;
        const totalMs = cuTotalMs + smTotalMs;
        const totalAttempts = cuAttempts + smAttempts;
        const avgSec = totalAttempts ? Math.round((totalMs / totalAttempts / 1000) * 100) / 100 : 0;
        const row = { model, create_user: `${cuPct}%`, sum: `${smPct}%`, avgTimeSec: avgSec };
        for (const k of PASS_AT_KS) {
            if (k === 1) continue;
            const cuAvg = cuPassAtCounts[k] ? roundToOneDecimal(cuPassAtSums[k] / cuPassAtCounts[k]) : null;
            const smAvg = smPassAtCounts[k] ? roundToOneDecimal(smPassAtSums[k] / smPassAtCounts[k]) : null;
            row[`p@${k}_cu`] = cuAvg === null ? "-" : `${cuAvg}%`;
            row[`p@${k}_sum`] = smAvg === null ? "-" : `${smAvg}%`;
        }
        fixedRows.push(row);
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
        const basicPassAtSums = {},
            basicPassAtCounts = {};
        const hardPassAtSums = {},
            hardPassAtCounts = {};
        const extraPassAtSums = {},
            extraPassAtCounts = {};
        for (const k of PASS_AT_KS) {
            if (k === 1) continue;
            basicPassAtSums[k] = 0;
            basicPassAtCounts[k] = 0;
            hardPassAtSums[k] = 0;
            hardPassAtCounts[k] = 0;
            extraPassAtSums[k] = 0;
            extraPassAtCounts[k] = 0;
        }
        for (const [taskId, s] of Object.entries(tasksMap)) {
            if (/(_|^)extra_hard$/i.test(taskId)) {
                extraSuccess += s.success;
                extraAttempts += s.attempts;
                for (const k of PASS_AT_KS) {
                    if (k === 1) continue;
                    if (typeof s.passAt?.[k] === "number") {
                        extraPassAtSums[k] += s.passAt[k];
                        extraPassAtCounts[k] += 1;
                    }
                }
            } else if (/(_|^)hard$/i.test(taskId)) {
                hardSuccess += s.success;
                hardAttempts += s.attempts;
                for (const k of PASS_AT_KS) {
                    if (k === 1) continue;
                    if (typeof s.passAt?.[k] === "number") {
                        hardPassAtSums[k] += s.passAt[k];
                        hardPassAtCounts[k] += 1;
                    }
                }
            } else {
                basicSuccess += s.success;
                basicAttempts += s.attempts;
                for (const k of PASS_AT_KS) {
                    if (k === 1) continue;
                    if (typeof s.passAt?.[k] === "number") {
                        basicPassAtSums[k] += s.passAt[k];
                        basicPassAtCounts[k] += 1;
                    }
                }
            }
        }
        const basicPct = basicAttempts ? Math.round((basicSuccess / basicAttempts) * 1000) / 10 : 0;
        const hardPct = hardAttempts ? Math.round((hardSuccess / hardAttempts) * 1000) / 10 : 0;
        const extraPct = extraAttempts ? Math.round((extraSuccess / extraAttempts) * 1000) / 10 : 0;
        const row = { model, basic: `${basicPct}%`, hard: `${hardPct}%`, extra_hard: `${extraPct}%` };
        for (const k of PASS_AT_KS) {
            if (k === 1) continue;
            const bAvg = basicPassAtCounts[k]
                ? roundToOneDecimal(basicPassAtSums[k] / basicPassAtCounts[k])
                : null;
            const hAvg = hardPassAtCounts[k]
                ? roundToOneDecimal(hardPassAtSums[k] / hardPassAtCounts[k])
                : null;
            const eAvg = extraPassAtCounts[k]
                ? roundToOneDecimal(extraPassAtSums[k] / extraPassAtCounts[k])
                : null;
            row[`p@${k}_basic`] = bAvg === null ? "-" : `${bAvg}%`;
            row[`p@${k}_hard`] = hAvg === null ? "-" : `${hAvg}%`;
            row[`p@${k}_extra`] = eAvg === null ? "-" : `${eAvg}%`;
        }
        diffRows.push(row);
    }
    console.log("Per model summary by difficulty (basic, hard, extra_hard):");
    console.table(diffRows);

    const totalDurationSec = Math.round((Date.now() - benchmarkStart) / 1000);
    console.log(`Total benchmark time: ${totalDurationSec} seconds`);
}

run().catch((err) => {
    console.error("Benchmark run failed:", err);
    process.exit(1);
});
