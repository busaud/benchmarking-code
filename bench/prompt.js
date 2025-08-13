module.exports = function buildPrompt(task) {
    const isReact = task.type === "react_component";
    if (isReact) {
        return [
            "You are generating a React component in Node.js (CommonJS).",
            "REQUIREMENTS:",
            "- Output ONLY one code block fenced with ```js and nothing else.",
            "- The code must export the component as module.exports = Component;",
            "- Do not write comments or explanations outside the code block.",
            "- Use only built-in Node.js and react. No external imports except react.",
            "- Do NOT use JSX. Use React.createElement or function components returning elements.",
            "",
            "TASK:",
            task.description,
            "",
            "INPUT/OUTPUT CONTRACT:",
            task.contract,
            "",
            "TESTING:",
            "- The component will be required by tests and rendered with ReactDOMServer.renderToString.",
            "",
            "Return only the code block.",
        ].join("\n");
    }

    return [
        "You are generating Node.js + Express code for a single endpoint.",
        "REQUIREMENTS:",
        "- Output ONLY one code block fenced with ```js and nothing else.",
        "- The code must export an Express app as module.exports = app;",
        "- Do not write comments or explanations outside the code block.",
        "- Use only built-in Node.js and express. No external imports except express.",
        "- The app must listen only when process.env.PORT_RUN is set; otherwise export app without listen.",
        "",
        "TASK:",
        task.description,
        "",
        "INPUT/OUTPUT CONTRACT:",
        task.contract,
        "",
        "TESTING:",
        "- The app will be required by tests and mounted without starting a server.",
        "",
        "Return only the code block.",
    ].join("\n");
};
