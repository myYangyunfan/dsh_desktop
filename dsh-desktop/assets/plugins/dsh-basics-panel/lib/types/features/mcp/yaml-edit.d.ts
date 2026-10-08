/** One row to edit: its profile-scope identity plus its owning preset, if any. */
export interface RowTarget {
    rowId?: string | null;
    serverName: string;
    /** Owning preset id; null/absent addresses a profile-scope row. */
    presetId?: string | null;
}
/**
 * Flip one row's `disabled` flag in a composition document. `disabled === true`
 * adds the flag; `false` removes it (the Loader default). Returns the edited
 * text, or the original text with `ok: false` when the row or document is
 * unparsable/unfound.
 */
export declare function setRowDisabled(text: string, target: RowTarget, disabled: boolean): {
    ok: boolean;
    text: string;
};
/** Editable fields on one MCP row's `config` mapping (null deletes the field). */
export interface RowConfigPatch {
    serverName?: string;
    transport?: string;
    command?: string | null;
    args?: string[] | null;
    env?: Record<string, string> | null;
    url?: string | null;
    headers?: Record<string, string> | null;
    cwd?: string | null;
    toolCallTimeoutMs?: number | null;
}
/** A new `mcp-client` row to append, as it should land in the document. */
export interface RowSeed {
    id: string;
    name: string;
    config: Record<string, unknown>;
}
/**
 * Append a new row to a composition document. The row lands inside an existing
 * top-level `insert` list when one is present, otherwise a fresh `insert` block
 * is created; an empty document is seeded with one. Comments and every other
 * key stay byte-stable because the edit happens on the node tree.
 */
export declare function addRow(text: string, row: RowSeed): {
    ok: boolean;
    text: string;
};
/**
 * Update one row's `config` mapping in place. A null/absent patch value is
 * skipped; an explicit null deletes the key. Values are converted through the
 * document's node factory so nested objects/arrays serialize correctly.
 */
export declare function setRowConfig(text: string, target: RowTarget, patch: RowConfigPatch): {
    ok: boolean;
    text: string;
};
