/** Only verified direct paths receive the larger budget; unknown paths fail closed. */
export function workspaceUploadMaxBytes(mode) {
    return mode === 'LAN' || mode === 'P2P' ? 1024 * 1024 * 1024 : 20 * 1024 * 1024;
}
//# sourceMappingURL=workspace-transfer-limits.js.map