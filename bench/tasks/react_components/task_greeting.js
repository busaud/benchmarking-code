module.exports = {
    id: "greeting",
    type: "react_component",
    description:
        'Create a React function component that renders a greeting. It takes props { name: string } and renders a <div data-testid="greeting">Hello, {name}!<\/div>. Export the component as module.exports = Component. Do not use JSX.',
    contract: [
        "Props: { name: string }",
        "Output HTML contains: 'Hello, Mo!' and data-testid=\"greeting\"",
    ].join("\n"),
    component: {
        cases: [
            {
                props: { name: "Mo" },
                expect: { htmlContains: ["Hello, Mo!", 'data-testid="greeting"'] },
            },
            {
                props: { name: "Ada" },
                expect: { htmlContains: ["Hello, Ada!", 'data-testid="greeting"'] },
            },
        ],
    },
};
