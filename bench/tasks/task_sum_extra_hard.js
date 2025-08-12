module.exports = {
    id: "sum",
    description:
        'Create an Express app with GET /sum that accepts query params a and b and returns JSON { result: a + b }. For errors: status 400 with{ error: "invalid_input" }',
    contract: ["No Hints"].join("\n"),
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
