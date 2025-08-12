module.exports = {
    id: "create_user",
    description:
        'Create an Express app with POST /users that accepts JSON email and name. name max length is 2. On success, return 201 with { id: string, email, name }. On error, status 400 with { error: "invalid_input" }. No database; generate id with a deterministic hash of email.',
    contract: ["No Hints"].join("\n"),
    endpoint: {
        method: "post",
        path: "/users",
        cases: [
            {
                body: { email: "a@b.net", name: "so" },
                status: 201,
                expect: { contains: { email: "a@b.net", name: "so" }, hasProps: ["id"] },
            },
            {
                body: { email: "a@B", name: "M" },
                status: 400,
                expect: { equals: { error: "invalid_input" } },
            },
            {
                body: { email: "@gmail.com", name: "M" },
                status: 400,
                expect: { equals: { error: "invalid_input" } },
            },
            {
                body: { email: "invalid", name: "M" },
                status: 400,
                expect: { equals: { error: "invalid_input" } },
            },
            {
                body: { email: "me@gmail.com", name: "abc" },
                status: 400,
                expect: { equals: { error: "invalid_input" } },
            },
        ],
    },
};
