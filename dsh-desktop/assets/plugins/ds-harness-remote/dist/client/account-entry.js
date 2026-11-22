/**
 * Anchoring for the Compact sidebar entry.
 *
 * The host shell exposes no slot at the end of the account row (only
 * `sidebar.settings` and `sidebar.footer.action`), so the Compact entry is
 * portalled into the settings row DOM. Native DSH renders that row as
 * ui-settings-general's `triggerRow`. DS-Bot 0.3.2+ disables that shell and
 * replaces it with its own `.bt-settings-row`, so anchoring has to accept both.
 * Rows that are not laid out are skipped, and a missing anchor is reported once
 * instead of leaving the saved style looking applied while it silently fell
 * back to the Standard entry.
 */
const NATIVE_ROW_SELECTOR = '[class*="settingsArea"] [class*="triggerRow"]';
const DS_BOT_ROW_SELECTOR = '[class*="settingsArea"] .bt-settings-row';
/** Anchor candidates in preference order: native DSH row, then DS-Bot's. */
export const accountRowSelectors = [NATIVE_ROW_SELECTOR, DS_BOT_ROW_SELECTOR];
/** Retry cadence while the sidebar footer is still mounting. */
export const accountRowRetry = { intervalMs: 50, attempts: 40 };
const MISSING_ANCHOR_WARNING = 'ds-harness-remote: Compact sidebar entry found no account row '
    + '([class*="settingsArea"] [class*="triggerRow"] or [class*="settingsArea"] .bt-settings-row). '
    + 'This host/DS-Bot combination exposes no Compact slot; the Standard entry stays in the sidebar footer.';
const warned = new Set();
function reportMissingAnchor() {
    if (warned.has(MISSING_ANCHOR_WARNING))
        return;
    warned.add(MISSING_ANCHOR_WARNING);
    console.warn(MISSING_ANCHOR_WARNING);
}
/** A hidden row (collapsed sidebar, closed settings shell) is not an anchor. */
function isLaidOut(row) {
    return typeof row.getClientRects !== 'function' || row.getClientRects().length > 0;
}
/** First laid-out account row under `root`, preferring the native DSH row. */
export function findAccountRow(root) {
    for (const selector of accountRowSelectors) {
        for (const row of Array.from(root.querySelectorAll(selector))) {
            if (isLaidOut(row))
                return row;
        }
    }
    return null;
}
/**
 * Keeps one host node at the end of the account row and reports where it lives.
 * The host and DS-Bot re-render their rows without React knowing about this
 * node, and a full remount replaces the row, so every DOM change re-resolves the
 * anchor and moves the same node instead of adding another. `attach` receives
 * the node once it is in the document and `null` whenever no row is available,
 * so the caller can keep the Standard entry as a working fallback.
 */
export function mountAccountEntry(attach) {
    let attempt = 0;
    let timer;
    let host;
    let attached = false;
    let observer;
    const sync = () => {
        if (timer !== undefined) {
            window.clearTimeout(timer);
            timer = undefined;
        }
        const row = findAccountRow(document);
        if (row === null) {
            // A portal into a detached node would leave no visible entry at all, so
            // hand the slot back to the Standard entry while the row is gone.
            if (attached) {
                attached = false;
                attach(null);
            }
            // The row mounts with the footer area; give the host a moment before
            // settling for the Standard entry.
            if (attempt < accountRowRetry.attempts) {
                attempt += 1;
                timer = window.setTimeout(sync, accountRowRetry.intervalMs);
            }
            else {
                reportMissingAnchor();
            }
            return;
        }
        attempt = 0;
        if (host === undefined)
            host = document.createElement('span');
        // Re-append only when the node is actually missing: an unconditional append
        // would duplicate the entry on every unrelated re-render of the row.
        if (host.parentElement !== row || !host.isConnected)
            row.append(host);
        if (!attached) {
            attached = true;
            attach(host);
        }
        if (observer === undefined && document.body !== null) {
            // Skip the lookup for the common case: a re-render somewhere else in the
            // app while the entry is still in a live account row.
            observer = new MutationObserver(() => { if (!attached || host?.isConnected !== true)
                sync(); });
            observer.observe(document.body, { childList: true, subtree: true });
        }
    };
    sync();
    return () => {
        if (timer !== undefined)
            window.clearTimeout(timer);
        observer?.disconnect();
        host?.remove();
    };
}
//# sourceMappingURL=account-entry.js.map