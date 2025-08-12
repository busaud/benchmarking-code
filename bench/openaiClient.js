const OpenAI = require("openai");
const dotenv = require("dotenv");
dotenv.config();

const apiKey = process.env.OPENAI_API_KEY;
const baseURL = process.env.OPENAI_BASE_URL;

if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY in environment");
}

if (!baseURL) {
    throw new Error("Missing OPENAI_BASE_URL in environment");
}

const client = new OpenAI({
    apiKey,
    baseURL,
});

module.exports = client;
