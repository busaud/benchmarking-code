function extractCodeBlocks(text) {
    if (!text) return [];
    const pattern = /```([a-zA-Z0-9_-]*)[ \t]*\r?\n([\s\S]*?)```/g;
    const blocks = [];
    let match;
    while ((match = pattern.exec(text)) !== null) {
        const lang = (match[1] || "").toLowerCase();
        const code = (match[2] || "").trim();
        blocks.push({ lang, code, index: match.index });
    }
    return blocks;
}

function looksLikeExpress(code) {
    return /express/i.test(code) && /(module\.exports\s*=\s*app|export\s+default\s+app)/i.test(code);
}

function chooseBestBlock(blocks) {
    if (!blocks.length) return null;
    const preferredLangs = ["js", "javascript", "node", "ts", "typescript"];

    const preferredWithExpress = blocks.find(
        (b) => preferredLangs.includes(b.lang) && looksLikeExpress(b.code)
    );
    if (preferredWithExpress) return preferredWithExpress.code;

    const anyWithExpress = blocks.find((b) => looksLikeExpress(b.code));
    if (anyWithExpress) return anyWithExpress.code;

    const preferredAny = blocks.find((b) => preferredLangs.includes(b.lang));
    if (preferredAny) return preferredAny.code;

    blocks.sort((a, b) => b.code.length - a.code.length);
    return blocks[0].code;
}

function extractFirstJsBlock(text) {
    const blocks = extractCodeBlocks(text);
    if (blocks.length) return chooseBestBlock(blocks);

    const firstFence = text.indexOf("```");
    if (firstFence >= 0) {
        const next = text.indexOf("```", firstFence + 3);
        const inner = next > firstFence ? text.slice(firstFence + 3, next) : text.slice(firstFence + 3);
        return inner.trim();
    }

    if (looksLikeExpress(text)) return text.trim();
    return null;
}

module.exports = { extractFirstJsBlock };
