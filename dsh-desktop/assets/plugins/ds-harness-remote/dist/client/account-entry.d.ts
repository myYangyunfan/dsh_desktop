/** Anchor candidates in preference order: native DSH row, then DS-Bot's. */
export declare const accountRowSelectors: readonly ["[class*=\"settingsArea\"] [class*=\"triggerRow\"]", "[class*=\"settingsArea\"] .bt-settings-row"];
/** Retry cadence while the sidebar footer is still mounting. */
export declare const accountRowRetry: {
    readonly intervalMs: 50;
    readonly attempts: 40;
};
/** First laid-out account row under `root`, preferring the native DSH row. */
export declare function findAccountRow(root: ParentNode): HTMLElement | null;
/**
 * Keeps one host node at the end of the account row and reports where it lives.
 * The host and DS-Bot re-render their rows without React knowing about this
 * node, and a full remount replaces the row, so every DOM change re-resolves the
 * anchor and moves the same node instead of adding another. `attach` receives
 * the node once it is in the document and `null` whenever no row is available,
 * so the caller can keep the Standard entry as a working fallback.
 */
export declare function mountAccountEntry(attach: (container: HTMLElement | null) => void): () => void;
//# sourceMappingURL=account-entry.d.ts.map