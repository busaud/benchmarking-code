const fs = require("fs");
const path = require("path");

const tasksDir = __dirname;

function fileNameToId(filename) {
    const base = filename.replace(/\.js$/i, "");
    return base.slice(5).replace(/[^a-zA-Z0-9_-]+/g, "_");
}

const collected = [];

for (const file of fs.readdirSync(tasksDir)) {
    if (file === "index.js") continue;
    if (!file.endsWith(".js") || !file.startsWith("task_")) continue;
    const id = fileNameToId(file);
    if (!id) continue;

    const taskPath = path.join(tasksDir, file);
    // eslint-disable-next-line import/no-dynamic-require, global-require
    const task = require(taskPath);
    if (!task || typeof task !== "object") continue;

    collected.push({ ...task, id });
}

module.exports = collected;
