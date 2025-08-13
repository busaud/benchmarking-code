module.exports = {
    id: "badge",
    type: "react_component",
    description:
        "Create a React function component that renders a badge. Props: { label: string, kind?: 'success'|'error' }. Render <span data-testid=\"badge\" class=\"badge badge-{kind||'default'}\">{label}<\/span>. Default kind is 'default'. Export the component as module.exports = Component. Do not use JSX.",
    contract: [
        "Props: { label: 'OK' } => contains: class=\"badge badge-default\", 'OK'",
        "Props: { label: 'Oops', kind: 'error' } => contains: class=\"badge badge-error\", 'Oops'",
    ].join("\n"),
    component: {
        cases: [
            {
                props: { label: "OK" },
                expect: { htmlContains: ['class="badge badge-default"', 'data-testid="badge"', ">OK<"] },
            },
            {
                props: { label: "Oops", kind: "error" },
                expect: { htmlContains: ['class="badge badge-error"', ">Oops<"] },
            },
        ],
    },
};
