/** Browser-safe decoding of published pi-acp tool result notifications. */
export function piToolResult(update) {
    let content = Array.isArray(update.content)
        ? update.content.flatMap((item) => {
            if (item?.type === 'content' && item.content?.type === 'text' && typeof item.content.text === 'string')
                return [{ type: 'text', text: item.content.text }];
            if (item?.type === 'diff' && typeof item.path === 'string' && typeof item.newText === 'string'
                && (item.oldText === null || typeof item.oldText === 'string')) {
                return [{ type: 'text', text: `File: ${item.path}\n--- before\n${item.oldText ?? ''}\n+++ after\n${item.newText}` }];
            }
            return [];
        }) : [];
    if (!content.length && Array.isArray(update.rawOutput?.content))
        content = update.rawOutput.content
            .filter((item) => item?.type === 'text' && typeof item.text === 'string')
            .map((item) => ({ type: 'text', text: item.text }));
    const output = update._meta?.terminal_output?.data;
    if (typeof output === 'string')
        content.push({ type: 'text', text: output });
    return { content, isError: update.status === 'failed' || update.rawOutput?.isError === true };
}
//# sourceMappingURL=pi-tool-result.js.map