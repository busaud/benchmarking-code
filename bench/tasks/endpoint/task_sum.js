module.exports = {
    id: "sum",
    type: "endpoint",
    description:
        'Create an Express app with GET /sum that accepts query params a and b (numbers) and returns JSON { result: a + b }. Validate inputs: if a or b is missing or not a finite number, return 400 with JSON { error: "invalid_input" }.',
    contract: [
        "Request: GET /sum?a=3&b=4",
        '\nResponse: 200 { "result": 7 }',
        "Request: GET /sum?a=x&b=1",
        '\nResponse: 400 { "error": "invalid_input" }',
    ].join("\n"),
    endpoint: {
        method: "get",
        path: "/sum",
        cases: [
            {
                query: { a: 3, b: 4 },
                status: 200,
                expect: { equals: { result: 7 } },
            },
            {
                query: { a: "3", b: "4" },
                status: 200,
                expect: { equals: { result: 7 } },
            },
            {
                query: { a: "x", b: 1 },
                status: 400,
                expect: { equals: { error: "invalid_input" } },
            },
            {
                query: { a: 1, b: "one" },
                status: 400,
                expect: { equals: { error: "invalid_input" } },
            },
        ],
    },
};
