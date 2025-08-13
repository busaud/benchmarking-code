const fs = require("fs");
const path = require("path");

const tasksRoot = __dirname;

function fileNameToId(filename) {
    const base = filename.replace(/\.js$/i, "");
    return base.slice(5).replace(/[^a-zA-Z0-9_-]+/g, "_");
}

function collectTasksFromDir(dirPath, prefixParts) {
    const collected = [];
    for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
        if (entry.isDirectory()) {
            const nextDir = path.join(dirPath, entry.name);
            const nextPrefix = [...prefixParts, entry.name.replace(/[^a-zA-Z0-9_-]+/g, "_")];
            collected.push(...collectTasksFromDir(nextDir, nextPrefix));
            continue;
        }
        const file = entry.name;
        if (!file.endsWith(".js") || !file.startsWith("task_")) continue;
        const idLocal = fileNameToId(file);
        const id = [...prefixParts, idLocal].filter(Boolean).join("_");
        const taskPath = path.join(dirPath, file);
        // eslint-disable-next-line import/no-dynamic-require, global-require
        const task = require(taskPath);
        if (!task || typeof task !== "object") continue;
        collected.push({
            ...task,
            id,
            type: task.type || (prefixParts.includes("react_components") ? "react_component" : "endpoint"),
        });
    }
    return collected;
}

// Only load from modular groups
const groups = ["endpoint", "react_components"];
const collected = [];
for (const group of groups) {
    const groupDir = path.join(tasksRoot, group);
    if (fs.existsSync(groupDir) && fs.statSync(groupDir).isDirectory()) {
        collected.push(...collectTasksFromDir(groupDir, [group]));
    }
}

module.exports = collected;
