const request = require("supertest");

/**
 * Validate an Express endpoint using a declarative test plan from the task definition.
 * Returns an object with per-case results rather than throwing.
 */
async function validateEndpoint(app, task) {
    if (!task || !task.endpoint) throw new Error("Task missing endpoint config");
    const { method, path, cases } = task.endpoint;
    if (!method || !path || !Array.isArray(cases)) {
        throw new Error("Invalid endpoint config: method, path, cases required");
    }

    const server = request(app);
    const results = [];

    for (let i = 0; i < cases.length; i += 1) {
        const testCase = cases[i];
        const httpMethod = method.toLowerCase();
        if (typeof server[httpMethod] !== "function") {
            results.push({ index: i, passed: false, reason: `Unsupported method: ${method}` });
            continue;
        }

        let req = server[httpMethod](path);

        if (testCase.headers) {
            for (const [k, v] of Object.entries(testCase.headers)) {
                req = req.set(k, v);
            }
        }

        if (testCase.query) {
            req = req.query(testCase.query);
        }

        if (testCase.body) {
            req = req.send(testCase.body);
        }

        let res;
        try {
            res = await req;
        } catch (e) {
            results.push({ index: i, passed: false, reason: `Request failed: ${e?.message || e}` });
            continue;
        }

        if (res.status !== testCase.status) {
            results.push({
                index: i,
                passed: false,
                reason: `Expected status ${testCase.status}, got ${res.status}`,
                received: { status: res.status, body: res.body },
            });
            continue;
        }

        const expected = testCase.expect || {};

        if (expected.equals) {
            const equal = JSON.stringify(res.body) === JSON.stringify(expected.equals);
            if (!equal) {
                results.push({
                    index: i,
                    passed: false,
                    reason: `Body mismatch`,
                    expected: expected.equals,
                    received: res.body,
                });
                continue;
            }
        }

        if (expected.contains) {
            let containsOk = true;
            for (const [k, v] of Object.entries(expected.contains)) {
                if (res.body?.[k] !== v) {
                    containsOk = false;
                    results.push({
                        index: i,
                        passed: false,
                        reason: `Missing or mismatched key '${k}'`,
                        expected: v,
                        received: res.body?.[k],
                    });
                    break;
                }
            }
            if (!containsOk) continue;
        }

        if (expected.hasProps) {
            let hasPropsOk = true;
            for (const prop of expected.hasProps) {
                if (!(prop in (res.body || {}))) {
                    hasPropsOk = false;
                    results.push({
                        index: i,
                        passed: false,
                        reason: `Missing property '${prop}'`,
                        received: res.body,
                    });
                    break;
                }
            }
            if (!hasPropsOk) continue;
        }

        results.push({ index: i, passed: true });
    }

    const allPassed = results.every((r) => r.passed);
    return { allPassed, caseResults: results };
}

module.exports = { validateEndpoint };
