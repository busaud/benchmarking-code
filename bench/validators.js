const request = require("supertest");

/**
 * Validate an Express endpoint using a declarative test plan from the task definition.
 * The task should provide:
 * {
 *   endpoint: {
 *     method: 'get' | 'post' | 'put' | 'patch' | 'delete',
 *     path: string,
 *     cases: Array<{
 *       query?: object,
 *       body?: object,
 *       headers?: object,
 *       status: number,
 *       expect?: {
 *         equals?: object,
 *         contains?: object,
 *         hasProps?: string[]
 *       }
 *     }>
 *   }
 * }
 */
async function validateEndpoint(app, task) {
    if (!task || !task.endpoint) throw new Error("Task missing endpoint config");
    const { method, path, cases } = task.endpoint;
    if (!method || !path || !Array.isArray(cases)) {
        throw new Error("Invalid endpoint config: method, path, cases required");
    }

    const server = request(app);

    for (const testCase of cases) {
        const httpMethod = method.toLowerCase();
        if (typeof server[httpMethod] !== "function") {
            throw new Error(`Unsupported method: ${method}`);
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

        const res = await req;

        if (res.status !== testCase.status) {
            throw new Error(`Expected status ${testCase.status}, got ${res.status}`);
        }

        const expected = testCase.expect || {};

        if (expected.equals) {
            if (JSON.stringify(res.body) !== JSON.stringify(expected.equals)) {
                throw new Error(
                    `Body mismatch. Expected equals ${JSON.stringify(expected.equals)}, got ${JSON.stringify(res.body)}`
                );
            }
        }

        if (expected.contains) {
            for (const [k, v] of Object.entries(expected.contains)) {
                if (res.body?.[k] !== v) {
                    throw new Error(
                        `Body missing or mismatched key '${k}'. Expected ${JSON.stringify(v)}, got ${JSON.stringify(res.body?.[k])}`
                    );
                }
            }
        }

        if (expected.hasProps) {
            for (const prop of expected.hasProps) {
                if (!(prop in (res.body || {}))) {
                    throw new Error(`Body missing required property '${prop}'`);
                }
            }
        }
    }
}

module.exports = { validateEndpoint };
