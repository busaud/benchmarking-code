function extractFirstJsBlock(text) {
    if (!text) return null;
    const fence = /```(?:js|javascript)?\n([\s\S]*?)```/i;
    const match = text.match(fence);
    return match ? match[1].trim() : null;
}

module.exports = { extractFirstJsBlock };
