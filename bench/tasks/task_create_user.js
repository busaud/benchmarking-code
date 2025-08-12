module.exports = {
    id: "create_user",
    description:
        'Create an Express app with POST /users that accepts JSON { "email": string, "name": string }. Validate: email must contain \'@\' and name length >= 2. On success, return 201 with { id: string, email, name }. On invalid input, return 400 { error: "invalid_input" }. No database; generate id with a deterministic hash of email.',
    contract: [
        'Request: POST /users { "email": "a@b.com", "name": "Mo" }',
        'Response: 201 { "id": "<hash>", "email": "a@b.com", "name": "Mo" }',
        'Request: POST /users { "email": "invalid", "name": "M" }',
        'Response: 400 { "error": "invalid_input" }',
    ].join("\n"),
    endpoint: {
        method: "post",
        path: "/users",
        cases: [
            {
                body: { email: "a@b.com", name: "Mo" },
                status: 201,
                expect: { contains: { email: "a@b.com", name: "Mo" }, hasProps: ["id"] },
            },
            {
                body: { email: "invalid", name: "M" },
                status: 400,
                expect: { equals: { error: "invalid_input" } },
            },
        ],
    },
};
