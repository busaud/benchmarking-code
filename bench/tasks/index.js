const fs = require("fs");
const path = require("path");

const tasksDir = __dirname;

const tasks = fs
    .readdirSync(tasksDir)
    .filter((f) => f !== "index.js" && f.startsWith("task_") && f.endsWith(".js"))
    .map((f) => require(path.join(tasksDir, f)));

module.exports = tasks;
